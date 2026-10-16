"""Regression tests for the real usability issues discovered by hands-on audit."""
import datetime,json,threading
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
server=ThreadingHTTPServer(('127.0.0.1',4185),partial(SimpleHTTPRequestHandler,directory='/workspace/sites/group-scout/dist'))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Bangkok')
  page=context.new_page();errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto('http://127.0.0.1:4185/',wait_until='networkidle')
  assert page.locator('#quick-start').is_visible()
  assert not page.locator('.stats-grid').is_visible()
  assert not page.locator('.pipeline-panel').is_visible()
  assert not page.locator('.field-top-grid').is_visible()
  page.screenshot(path='/tmp/groupscout-simple-onboarding.png',full_page=True)
  page.locator('#start-setup').click()
  assert page.locator('#plan-panel').is_visible()
  assert page.locator('#campaign-form [name=formUrl]').evaluate('(el)=>el===document.activeElement')
  page.locator('#campaign-form [name=formUrl]').fill('https://forms.gle/sampleSurvey')
  page.locator('#campaign-form [type=submit]').click()
  page.locator('.content-tabs [data-view=fieldwork]').click()
  page.locator('#start-add').click();form=page.locator('#group-form')
  assert not page.locator('#group-extra').get_attribute('open')
  assert form.locator('[name=location]').input_value()==''
  assert form.locator('[name=responses]').count()==0
  form.locator('[name=name]').fill('Nhóm mua nhà Hà Nội')
  form.locator('[name=url]').fill('https://m.facebook.com/groups/uxhomes/?ref=share')
  page.keyboard.press('Escape')
  page.locator('#add-btn').click()
  assert form.locator('[name=name]').input_value()=='Nhóm mua nhà Hà Nội'
  assert 'khôi phục' in page.locator('#group-draft-note').inner_text()
  page.keyboard.press('Escape');page.reload(wait_until='networkidle');page.locator('#add-btn').click()
  assert form.locator('[name=name]').input_value()=='Nhóm mua nhà Hà Nội'
  page.locator('#group-extra summary').click()
  form.locator('[name=members]').fill('30000')
  form.locator('[name=postsPerDay]').fill(str(13/7))
  form.locator('[type=submit]').click()
  assert not page.locator('#group-dialog').is_visible()
  assert page.locator('#fieldwork-panel').is_visible()
  state=page.evaluate('JSON.parse(localStorage.getItem("groupscout-v1"))')
  group=state['groups'][0];gid=group['id'];source=group['sourceCode']
  assert group['location']=='' and group['responses']==0
  assert group['url']=='https://www.facebook.com/groups/uxhomes/'
  assert abs(group['postsPerDay']-13/7)<1e-12
  # The two searches have distinct purposes.
  page.locator('.content-tabs [data-view=discover]').click()
  assert page.locator('.group-card').count()==1
  page.locator('#search-input').fill('Một từ khóa không nằm trong nhóm đã thêm')
  assert page.locator('.group-card').count()==1
  page.locator('#directory-query').fill('Không tìm thấy nhóm này')
  assert page.locator('.group-card').count()==0
  page.locator('#directory-query').fill('mua nha')
  assert page.locator('.group-card').count()==1
  # Quick counting skips unrelated workflow fields.
  page.locator('.content-tabs [data-view=fieldwork]').click()
  page.locator('[data-counts]').click();wf=page.locator('#workflow-form')
  assert page.locator('#wf-panel-counts').is_visible()
  assert not page.locator('#wf-panel-progress').is_visible()
  wf.locator('[name=received]').fill('10');wf.locator('[name=responses]').fill('8');wf.locator('[name=rejected]').fill('2')
  wf.locator('[type=submit]').click()
  assert page.locator('#stat-responses').inner_text()=='8'
  page.locator('[data-counts]').click()
  wf.locator('[name=received]').fill('9');wf.locator('[type=submit]').click()
  assert wf.locator('[name=received]').get_attribute('aria-invalid')=='true'
  assert wf.locator('[name=received]').evaluate('(el)=>el===document.activeElement')
  assert page.locator('#wf-panel-counts .field-error').is_visible()
  page.keyboard.press('Escape');page.locator('[data-counts]').click()
  assert wf.locator('[name=received]').input_value()=='9'
  page.locator('#discard-workflow-draft').click()
  assert wf.locator('[name=received]').input_value()=='10'
  assert wf.locator('[name=responses]').input_value()=='8'
  page.locator('#wf-tab-progress').click()
  wf.locator('[name=stage]').select_option('contacted')
  assert wf.locator('[name=contactedAt]').input_value()==page.evaluate('new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())')
  assert not wf.locator('[name=submittedAt]').is_visible()
  page.locator('[data-remind="3"]').click()
  assert wf.locator('[name=nextActionAt]').input_value()
  page.keyboard.press('Escape');page.locator('[data-workflow]').first.click()
  assert wf.locator('[name=stage]').input_value()=='contacted'
  assert wf.locator('[name=nextActionAt]').input_value()
  wf.locator('[type=submit]').click()
  assert page.locator('#stat-responses').inner_text()=='8'
  # Each composer mode retains its own draft even after closing/reload.
  page.locator('[data-compose]').first.click()
  page.locator('#composer-text').fill('Bài mời đã được tôi sửa riêng cho nhóm này.')
  page.locator('#compose-admin').click()
  page.locator('#composer-text').fill('Lời xin phép đã được tôi sửa riêng.')
  page.locator('#compose-invite').click()
  assert page.locator('#composer-text').input_value()=='Bài mời đã được tôi sửa riêng cho nhóm này.'
  page.keyboard.press('Escape');page.reload(wait_until='networkidle');page.locator('[data-compose]').first.click()
  assert page.locator('#composer-text').input_value()=='Bài mời đã được tôi sửa riêng cho nhóm này.'
  page.locator('#compose-admin').click()
  assert page.locator('#composer-text').input_value()=='Lời xin phép đã được tôi sửa riêng.'
  page.locator('#regenerate-composer').click()
  assert page.locator('#confirm-dialog').is_visible()
  page.locator('#confirm-action').click()
  assert 'quản trị' in page.locator('#composer-text').input_value()
  page.evaluate('Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:()=>Promise.reject(new Error("blocked"))}})')
  page.locator('#composer-source').click()
  assert page.locator('#composer-source-code').evaluate('(el)=>el===document.activeElement&&el.value.slice(el.selectionStart,el.selectionEnd)===el.value')
  assert page.locator('#composer-source-code').input_value()==source
  page.keyboard.press('Escape')
  # Native validation of a hidden tab routes back to the correct field.
  page.locator('[data-workflow]').first.click();page.locator('#wf-tab-source').click()
  wf.locator('[name=sourceCode]').fill('!!!')
  page.locator('#wf-tab-counts').click();wf.locator('[type=submit]').click()
  assert page.locator('#wf-panel-source').is_visible()
  wf.locator('[name=sourceCode]').fill(source)
  wf.locator('[type=submit]').click()
  page.locator('[data-workflow]').first.click()
  page.locator('#wf-tab-progress').focus();page.keyboard.press('ArrowRight')
  assert page.locator('#wf-tab-counts').get_attribute('aria-selected')=='true'
  page.keyboard.press('Escape')
  # Mobile primary actions fit the viewport and counters/save need no horizontal scroll.
  mobile=context.new_page();mobile.set_viewport_size({'width':390,'height':844})
  mobile.goto('http://127.0.0.1:4185/',wait_until='networkidle')
  button=mobile.locator('[data-counts]').first;button.scroll_into_view_if_needed()
  rect=button.bounding_box();assert rect['x']>=0 and rect['x']+rect['width']<=390
  assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
  button.click()
  assert mobile.locator('#wf-panel-counts').is_visible()
  assert mobile.locator('#workflow-form [name=received]').is_visible()
  save_rect=mobile.locator('#workflow-form [type=submit]').bounding_box()
  assert save_rect['y']>=0 and save_rect['y']+save_rect['height']<=844
  assert mobile.locator('#workflow-form [name=received]').evaluate('(el)=>parseFloat(getComputedStyle(el).fontSize)')>=16
  mobile.screenshot(path='/tmp/groupscout-simple-mobile-counts.png')
  mobile.keyboard.press('Escape');mobile.evaluate('window.scrollTo(0,0)')
  mobile.screenshot(path='/tmp/groupscout-simple-mobile.png',full_page=True)
  # An old draft cannot overwrite a newer confirmed edit after reload.
  page.locator('[data-counts]').click()
  wf.locator('[name=received]').fill('11');wf.locator('[name=responses]').fill('9')
  page.keyboard.press('Escape')
  other=context.new_page();other.goto('http://127.0.0.1:4185/',wait_until='networkidle')
  other.evaluate('''()=>{const x=JSON.parse(localStorage.getItem('groupscout-v1'));x.groups[0].received=12;x.groups[0].responses=10;x.revision++;localStorage.setItem('groupscout-v1',JSON.stringify(x));}''')
  page.reload(wait_until='networkidle');page.locator('[data-counts]').click()
  assert wf.locator('[name=received]').input_value()=='12'
  assert wf.locator('[name=responses]').input_value()=='10'
  assert 'Chưa áp dụng' in page.locator('#workflow-draft-note').inner_text()
  page.locator('#workflow-form [data-old-draft]').click()
  assert 'Bản nháp' in page.locator('#info-content').inner_text()
  page.locator('[data-close=info-dialog]').first.click()
  wf.locator('[type=submit]').click()
  assert page.evaluate('JSON.parse(localStorage.getItem("groupscout-v1")).groups[0].responses')==10
  other.close();mobile.close()
  # Client day is Bangkok even when browser/host timezone is behind it.
  night_context=browser.new_context(timezone_id='UTC')
  night=night_context.new_page()
  night.clock.install(time=datetime.datetime(2026,10,16,18,0,tzinfo=datetime.timezone.utc))
  night.goto('http://127.0.0.1:4185/',wait_until='networkidle')
  night.locator('#add-btn').click()
  nf=night.locator('#group-form')
  nf.locator('[name=name]').fill('Nhóm kiểm thử qua ngày')
  nf.locator('[name=url]').fill('https://facebook.com/groups/nightdate/')
  nf.locator('[name=surveys]').select_option('yes')
  assert nf.locator('[name=verifiedAt]').input_value()=='2026-10-17'
  nf.locator('[type=submit]').click()
  assert not night.locator('#group-dialog').is_visible()
  night.reload(wait_until='networkidle')
  assert night.locator('#workflow-rows tr').count()==1
  assert not night.locator('#storage-alert').is_visible()
  night.locator('[data-compose]').first.click()
  assert night.locator('#copy-composer').is_disabled()
  assert night.locator('#composer-setup').is_visible()
  night.locator('#composer-setup').click()
  assert night.locator('#plan-panel').is_visible()
  night_context.close()
  assert not errors,errors
  browser.close()
  print(json.dumps({'result':'PASS','checks':['short onboarding','minimum fields','mobile URL','no invented city','decimal activity','group draft after Escape/reload','separate searches','direct counter update','inline errors','workflow draft/discard','date shortcut','per-group composer drafts','safe regeneration','clipboard fallback','hidden-field validation','keyboard tabs','mobile cards/touch sizing/sticky save','old draft conflict protection']},ensure_ascii=False))
finally:server.shutdown();server.server_close()
