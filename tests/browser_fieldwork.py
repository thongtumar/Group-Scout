import threading, json, datetime
from zoneinfo import ZoneInfo
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
now=datetime.datetime.now(ZoneInfo('Asia/Bangkok')).date()
today=str(now); earlier=str(now-datetime.timedelta(days=4)); yesterday=str(now-datetime.timedelta(days=1))
server=ThreadingHTTPServer(('127.0.0.1',4173),partial(SimpleHTTPRequestHandler,directory='/workspace/sites/group-scout/dist'))
threading.Thread(target=server.serve_forever,daemon=True).start()
legacy={'version':1,'groups':[
 {'id':'legacy1','name':'Nhóm mua nhà Hà Nội','url':'https://www.facebook.com/groups/legacy1/','members':80000,'postsPerDay':20,'anonymous':'yes','surveys':'yes','category':'Mua nhà','location':'Hà Nội','verifiedAt':today,'notes':'','saved':True,'responses':12},
 {'id':'waiting','name':'Người mua nhà TP.HCM','url':'https://www.facebook.com/groups/waiting/','members':50000,'postsPerDay':10,'anonymous':'yes','surveys':'unknown','category':'Mua nhà','location':'TP.HCM','verifiedAt':today,'notes':'','saved':True,'responses':0,'stage':'contacted','contactedAt':earlier,'received':0},
 {'id':'denied','name':'Nhóm không cho khảo sát','url':'https://www.facebook.com/groups/denied/','members':100000,'postsPerDay':30,'anonymous':'yes','surveys':'no','category':'Cư dân','location':'Hà Nội','verifiedAt':today,'notes':'','saved':False,'responses':0,'received':0}
 ],'campaign':{'topic':'Tiêu dùng xanh trong ngành bất động sản','formUrl':'https://forms.gle/testform','minutes':5,'baseline':8},'checks':{},'postDraft':''}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  ctx=browser.new_context(viewport={'width':1440,'height':1100},accept_downloads=True,timezone_id='Asia/Bangkok')
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:4173/',wait_until='networkidle')
  page.evaluate('(data)=>localStorage.setItem("groupscout-v1",JSON.stringify(data))',legacy)
  page.reload(wait_until='networkidle')
  assert page.locator('#fieldwork-panel').is_visible()
  assert page.locator('#stat-responses').inner_text()=='20'
  assert page.locator('#workflow-rows tr').count()==3
  assert page.locator('#task-count').inner_text()=='2'
  assert 'Chưa rõ' in page.locator('#quality-summary').inner_text()
  row=page.locator('#workflow-rows tr').filter(has_text='Nhóm mua nhà Hà Nội')
  row.locator('[data-workflow]').click()
  f=page.locator('#workflow-form')
  source=f.locator('[name=sourceCode]').input_value();assert source.startswith('GS-')
  f.locator('[name=stage]').select_option('posted')
  assert f.locator('[name=postedAt]').input_value()==today
  page.locator('#wf-tab-counts').click()
  f.locator('[name=received]').fill('10')
  f.locator('[type=submit]').click()
  assert page.locator('#workflow-errors').inner_text()
  assert page.locator('#workflow-dialog').is_visible()
  assert page.locator('#wf-panel-counts').is_visible()
  page.locator('#wf-tab-progress').click()
  f.locator('[name=postedAt]').fill(earlier)
  f.locator('[name=nextActionAt]').fill(yesterday)
  f.locator('[name=nextAction]').fill('Rà soát lượt trả lời mới')
  f.locator('[name=postUrl]').fill('https://www.facebook.com/groups/legacy1/posts/123/')
  page.locator('#wf-tab-counts').click()
  f.locator('[name=received]').fill('20')
  f.locator('[name=responses]').fill('15')
  f.locator('[name=rejected]').fill('2')
  page.locator('#effort-extra summary').click()
  f.locator('[name=minutesSpent]').fill('30')
  url='https://docs.google.com/forms/d/e/TEST/viewform?usp=pp_url&entry.123='+source
  page.locator('#wf-tab-source').click()
  f.locator('[name=surveyUrl]').fill(url)
  f.locator('[type=submit]').click()
  assert not page.locator('#workflow-dialog').is_visible()
  assert page.locator('#stat-responses').inner_text()=='23'
  assert '3' in page.locator('#quality-summary').inner_text()
  assert '75%' in page.locator('#yield-summary').inner_text()
  assert page.locator('#task-count').inner_text()=='3'
  assert page.locator('.task-row').filter(has_text='Rà soát lượt trả lời mới').count()==1
  assert 'Quá hạn' in page.locator('.task-row').filter(has_text='Rà soát lượt trả lời mới').inner_text()
  row=page.locator('#workflow-rows tr').filter(has_text='Nhóm mua nhà Hà Nội')
  row.locator('[data-compose]').click()
  assert url in page.locator('#composer-text').input_value()
  assert page.locator('#composer-preview').get_attribute('href')==url
  page.locator('#compose-admin').click()
  assert 'xin phép' in page.locator('#composer-text').input_value().lower()
  page.locator('[data-close=composer-dialog]').click()
  # Quality data retained when editing ordinary group details.
  row.locator('[data-basic]').click()
  page.locator('#group-extra summary').click()
  page.locator('#group-form [name=notes]').fill('Đã kiểm tra nội quy')
  page.locator('#group-form [type=submit]').click()
  page.locator('.content-tabs [data-view=fieldwork]').click()
  row=page.locator('#workflow-rows tr').filter(has_text='Nhóm mua nhà Hà Nội')
  row.locator('[data-workflow]').click()
  assert f.locator('[name=received]').input_value()=='20'
  assert page.locator('#workflow-links a').count()==3
  assert f.locator('[name=stage]').input_value()=='posted'
  assert f.locator('[name=surveyUrl]').input_value()==url
  page.locator('#wf-tab-source').click()
  f.locator('[name=sourceCode]').fill('GS-CHANGED')
  f.locator('[type=submit]').click()
  assert 'Mã nguồn đã đổi' in page.locator('#workflow-errors').inner_text()
  assert page.locator('#wf-panel-source').is_visible()
  f.locator('[name=sourceCode]').fill(source)
  page.locator('#wf-tab-progress').click()
  page.locator('#mark-reviewed').click()
  f.locator('[type=submit]').click()
  assert page.locator('#task-count').inner_text()=='2'
  # Stopped groups retain responses and no longer generate tasks.
  page.locator('#workflow-rows tr').filter(has_text='Nhóm không cho khảo sát').locator('[data-workflow]').click()
  page.locator('#pause-recruitment').click();f.locator('[type=submit]').click()
  assert page.locator('#task-count').inner_text()=='1'
  assert page.locator('#stat-responses').inner_text()=='23'
  # Manual demographics describe the same23 valid responses.
  page.locator('#edit-sampling').click();sf=page.locator('#sampling-form')
  sf.locator('[name=hcmActual]').fill('20');sf.locator('[name=hnActual]').fill('10')
  sf.locator('[type=submit]').click()
  assert 'vượt' in page.locator('#sampling-errors').inner_text()
  sf.locator('[name=hcmActual]').fill('10');sf.locator('[name=hnActual]').fill('8')
  sf.locator('[name=age-18-24]').fill('4');sf.locator('[name=age-25-34]').fill('10')
  sf.locator('[type=submit]').click()
  assert page.locator('#stat-responses').inner_text()=='23'
  assert 'thành phố: 5' in page.locator('#sampling-summary').inner_text()
  assert 'độ tuổi: 9' in page.locator('#sampling-summary').inner_text()
  # Scheduled tasks and stage filter both usable.
  page.locator('#stage-filter').select_option('posted')
  assert page.locator('#workflow-rows tr').count()==1
  page.locator('#stage-filter').select_option('')
  page.evaluate('window.scrollTo(0,0)');page.locator('#toast').evaluate("el=>el.classList.remove('visible')")
  page.screenshot(path='/tmp/groupscout-v2-desktop.png',full_page=True)
  with page.expect_download() as di:page.locator('#field-backup').click()
  di.value.save_as('/tmp/groupscout-v2-backup.json')
  backup=json.load(open('/tmp/groupscout-v2-backup.json'))
  assert backup['version']==2 and backup['sampling']['hcmActual']==10
  saved=next(g for g in backup['groups'] if g['id']=='legacy1')
  assert saved['received']==20 and saved['responses']==15 and saved['surveyUrl']==url
  page.reload(wait_until='networkidle')
  assert page.locator('#fieldwork-panel').is_visible()
  assert page.locator('#stat-responses').inner_text()=='23'
  # A later decrease preserves distribution and flags overcount.
  page.locator('#workflow-rows tr').filter(has_text='Nhóm mua nhà Hà Nội').locator('[data-counts]').click()
  f.locator('[name=responses]').fill('5');f.locator('[type=submit]').click()
  assert page.locator('#stat-responses').inner_text()=='13'
  assert 'vượt tổng mẫu hợp lệ' in page.locator('#sampling-summary').inner_text()
  # Restore v2 atomically and retain previous snapshot recovery.
  page.locator('.content-tabs [data-view=plan]').click()
  page.locator('#import-file').set_input_files('/tmp/groupscout-v2-backup.json')
  page.locator('#confirm-action').click()
  assert page.locator('#stat-responses').inner_text()=='23'
  assert not page.locator('#export-recovery').is_hidden()
  raw=page.evaluate('JSON.parse(localStorage.getItem("groupscout-recovery-v1"))')
  assert raw['data']['groups'][0]['responses']==5
  # Data changed elsewhere must not be overwritten by the current tab.
  other=ctx.new_page();other.goto('http://127.0.0.1:4173/',wait_until='networkidle')
  other.evaluate('''()=>{const x=JSON.parse(localStorage.getItem('groupscout-v1'));x.revision+=1;x.campaign.baseline=9;localStorage.setItem('groupscout-v1',JSON.stringify(x))}''')
  page.locator('#storage-alert').wait_for(state='visible')
  assert 'tab khác' in page.locator('#storage-alert-text').inner_text()
  page.locator('#campaign-form [name=baseline]').fill('99')
  page.locator('#campaign-form [type=submit]').click()
  assert page.evaluate('JSON.parse(localStorage.getItem("groupscout-v1")).campaign.baseline')==9
  other.close()
  # Mobile view, real records, workflow and sample form.
  mobile=ctx.new_page();mobile.set_viewport_size({'width':390,'height':844})
  mobile.goto('http://127.0.0.1:4173/',wait_until='networkidle')
  assert mobile.locator('#fieldwork-panel').is_visible()
  assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
  mobile.screenshot(path='/tmp/groupscout-v2-mobile.png',full_page=True)
  mobile.screenshot(path='/tmp/groupscout-v2-mobile-top.png')
  mobile.locator('[data-workflow=legacy1]').first.click()
  assert mobile.locator('#workflow-dialog').is_visible()
  assert mobile.locator('#workflow-form [name=sourceCode]').input_value()==source
  mobile.locator('[data-close=workflow-dialog]').first.click()
  mobile.locator('#edit-sampling').click()
  assert mobile.locator('#sampling-dialog').is_visible()
  mobile.locator('[data-close=sampling-dialog]').first.click()
  # Recovery from malformed local data keeps the original raw bytes exportable.
  broken_context=browser.new_context(accept_downloads=True,timezone_id='Asia/Bangkok')
  broken=broken_context.new_page();broken.goto('http://127.0.0.1:4173/',wait_until='networkidle')
  broken.evaluate('localStorage.setItem("groupscout-v1","{broken-data")')
  broken.reload(wait_until='networkidle')
  assert broken.locator('#storage-alert').is_visible()
  assert broken.evaluate('localStorage.getItem("groupscout-v1")')=='{broken-data'
  broken.locator('.content-tabs [data-view=plan]').click()
  broken.locator('#import-file').set_input_files('/tmp/groupscout-v2-backup.json')
  broken.locator('#confirm-action').click()
  assert broken.locator('#stat-responses').inner_text()=='23'
  assert broken.locator('#export-recovery').is_visible()
  with broken.expect_download() as raw_di:broken.locator('#export-recovery').click()
  raw_di.value.save_as('/tmp/groupscout-recovered-raw.txt')
  assert open('/tmp/groupscout-recovered-raw.txt').read()=='{broken-data'
  assert not broken.locator('#storage-alert').is_visible()
  broken_context.close()
  assert not errors,errors
  browser.close()
  print(json.dumps({'result':'PASS','checks':['v1 migration','real-only workflow','approval vs visible post','count reconciliation','source-specific templates','preserve workflow on basic edit','due reminders','pause without sample loss','sample distribution/overcount','v2 backup and recovery','multi-tab conflict','mobile workflow','no JS errors']},ensure_ascii=False))
finally:server.shutdown();server.server_close()
