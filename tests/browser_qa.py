import os, threading, json
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
root='/workspace/sites/group-scout/dist'
server=ThreadingHTTPServer(('127.0.0.1',4173),partial(SimpleHTTPRequestHandler,directory=root))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1440,'height':1100},device_scale_factor=1,timezone_id='Asia/Bangkok')
  errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  page.goto('http://127.0.0.1:4173/',wait_until='networkidle')
  assert page.locator('#quick-start').is_visible()
  assert not page.locator('.pipeline-panel').is_visible()
  page.locator('.content-tabs [data-view=discover]').click()
  page.locator('#mode-demo').click()
  assert page.locator('.group-card').count()==6
  assert page.locator('#demo-notice').is_visible()
  page.screenshot(path='/tmp/groupscout-desktop.png',full_page=True)
  page.locator('label:has(#anon-filter)').click()
  assert page.locator('.group-card').count()==3
  page.locator('label:has(#survey-filter)').click()
  assert page.locator('.group-card').count()==1
  page.locator('#reset-filters').click()
  page.locator('#mode-mine').click()
  assert page.locator('#empty-state').is_visible()
  page.locator('#add-btn').click()
  form=page.locator('#group-form')
  form.locator('[name=name]').fill('Nhóm kiểm thử mua nhà Hà Nội')
  form.locator('[name=url]').fill('https://www.facebook.com/groups/qa-sample-group/')
  form.locator('#group-extra summary').click()
  form.locator('[name=members]').fill('50000')
  form.locator('[name=postsPerDay]').fill('12')
  form.locator('[name=anonymous]').select_option('yes')
  form.locator('[name=surveys]').select_option('yes')
  form.locator('[name=location]').select_option('Hà Nội')
  form.locator('[type=submit]').click()
  assert not page.locator('#group-dialog').is_visible()
  assert page.locator('#fieldwork-panel').is_visible()
  assert page.locator('#stat-responses').inner_text()=='0'
  page.locator('#workflow-rows [data-counts]').click()
  assert page.locator('#wf-panel-counts').is_visible()
  page.locator('#workflow-form [name=responses]').fill('23')
  page.locator('#workflow-form [type=submit]').click()
  page.locator('.content-tabs [data-view=discover]').click()
  assert page.locator('.group-card').count()==1
  assert page.locator('#stat-responses').inner_text()=='23'
  assert page.locator('#nav-saved').inner_text()=='1'
  page.reload(wait_until='networkidle')
  page.locator('.content-tabs [data-view=discover]').click()
  assert page.locator('.group-card').count()==1
  assert page.locator('#stat-responses').inner_text()=='23'
  page.locator('[data-details]').click()
  assert page.locator('#detail-edit').is_visible()
  page.locator('#detail-edit').click()
  form.locator('#group-extra summary').click()
  form.locator('[name=notes]').fill('Đã kiểm tra lại nội quy')
  form.locator('[type=submit]').click()
  assert page.locator('#stat-responses').inner_text()=='23'
  page.locator('#workflow-rows [data-counts]').click()
  page.locator('#workflow-form [name=responses]').fill('25')
  page.locator('#workflow-form [type=submit]').click()
  assert page.locator('#stat-responses').inner_text()=='25'
  page.locator('.content-tabs [data-view=plan]').click()
  campaign=page.locator('#campaign-form')
  campaign.locator('[name=formUrl]').fill('https://forms.gle/test123')
  campaign.locator('[name=baseline]').fill('100')
  campaign.locator('[type=submit]').click()
  assert page.locator('#stat-responses').inner_text()=='125'
  page.locator('#regenerate-post').click()
  assert 'https://forms.gle/test123' in page.locator('#post-template').input_value()
  with page.expect_download() as download_info: page.locator('#export-json').click()
  download=download_info.value
  download.save_as('/tmp/groupscout-qa-backup.json')
  data=json.load(open('/tmp/groupscout-qa-backup.json'))
  assert len(data['groups'])==1 and data['groups'][0]['responses']==25
  assert not any(g.get('_demo') for g in data['groups'])
  with page.expect_download() as csv_info: page.locator('#export-csv').click()
  csv_info.value.save_as('/tmp/groupscout-qa.csv')
  page.locator('.content-tabs [data-view=saved]').click()
  page.locator('[data-save]').click()
  assert page.locator('#empty-state').is_visible()
  page.locator('.content-tabs [data-view=discover]').click()
  page.locator('[data-details]').click(); page.locator('#detail-edit').click()
  page.locator('#delete-group').click(); page.locator('#confirm-action').click()
  assert page.locator('#stat-responses').inner_text()=='100'
  assert page.locator('#empty-state').is_visible()
  page.locator('.content-tabs [data-view=plan]').click()
  page.locator('#import-file').set_input_files('/tmp/groupscout-qa-backup.json')
  page.locator('#confirm-action').click()
  assert page.locator('#stat-responses').inner_text()=='125'
  page.locator('.content-tabs [data-view=discover]').click()
  assert page.locator('.group-card').count()==1
  # External search has encoded context, and does not send anything to a group.
  page.locator('#search-input').fill('mua nhà xanh')
  page.locator('#search-location').select_option('Hà Nội')
  assert page.locator('.group-card').count()==1
  page.evaluate('window.open=(url)=>{window.lastSearchUrl=url}')
  page.locator('#search-facebook').click()
  assert 'facebook.com/search/groups/' in page.evaluate('window.lastSearchUrl')
  assert 'H%C3%A0%20N%E1%BB%99i' in page.evaluate('window.lastSearchUrl')
  page.locator('#directory-query').fill('không có nhóm nào tên này')
  assert page.locator('.group-card').count()==0
  page.locator('#reset-filters').click()
  assert page.locator('.group-card').count()==1
  # User-entered markup remains plain text.
  page.locator('[data-details]').click();page.locator('#detail-edit').click()
  form.locator('[name=name]').fill('<img src=x onerror=alert(1)>')
  form.locator('[type=submit]').click()
  page.locator('.content-tabs [data-view=discover]').click()
  assert page.locator('.card-name img').count()==0
  assert '<img' in page.locator('.card-name').inner_text()
  # Fresh mobile viewport with no saved data.
  mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,timezone_id='Asia/Bangkok')
  mobile.goto('http://127.0.0.1:4173/',wait_until='networkidle')
  mobile.screenshot(path='/tmp/groupscout-mobile.png',full_page=True)
  assert mobile.locator('#quick-start').is_visible()
  assert mobile.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  mobile.locator('#add-btn').click()
  assert mobile.locator('#group-dialog').is_visible()
  assert mobile.evaluate('document.querySelector("#group-dialog").getBoundingClientRect().width')<=390
  mobile.locator('[data-close=group-dialog]').first.click()
  mobile.locator('.content-tabs [data-view=plan]').click()
  assert mobile.locator('#plan-panel').is_visible()
  assert mobile.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  assert not errors, errors
  browser.close()
  print(json.dumps({'result':'PASS','checks':['demo labeling','permission filters','real CRUD','local persistence','500 response tracking','campaign and template','JSON/CSV export','atomic import','Facebook query','XSS escaping','responsive mobile','no JavaScript errors']},ensure_ascii=False))
finally:
 server.shutdown();server.server_close()
