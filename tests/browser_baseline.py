"""Regression: onboarding must not conceal existing valid samples from other sources."""
import threading
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
server=ThreadingHTTPServer(('127.0.0.1',4186),partial(SimpleHTTPRequestHandler,directory='/workspace/sites/group-scout/dist'))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':390,'height':844},timezone_id='Asia/Bangkok')
  page.goto('http://127.0.0.1:4186/',wait_until='networkidle')
  assert page.locator('#quick-start').is_visible() and not page.locator('.stats-grid').is_visible()
  page.evaluate('''()=>localStorage.setItem('groupscout-v1',JSON.stringify({version:2,groups:[],campaign:{topic:'Khảo sát',formUrl:'https://forms.gle/testSurvey',minutes:5,baseline:25}}))''')
  page.reload(wait_until='networkidle')
  assert page.locator('.stats-grid').is_visible()
  assert page.locator('#stat-responses').inner_text()=='25'
  assert page.locator('.quality-panel').is_visible()
  assert '25 mẫu hợp lệ từ nguồn khác' in page.locator('#quality-summary').inner_text()
  assert page.locator('#field-analytics').is_visible()
  assert page.locator('#backup-reminder').is_visible()
  assert not page.locator('.pipeline-panel').is_visible()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  browser.close()
  print('PASS: existing other-source valid samples stay visible with no Facebook groups')
finally:server.shutdown();server.server_close()
