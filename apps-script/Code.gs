/**
 * รายงานการปฏิบัติงานส่วนบุคคล — หลังบ้าน Google Apps Script
 * ------------------------------------------------------------
 * 1) เปิด Google Sheet > ส่วนขยาย > Apps Script > วางโค้ดนี้ทั้งหมด > บันทึก
 * 2) ⚙️ การตั้งค่าโปรเจ็กต์ > คุณสมบัติของสคริปต์ > เพิ่ม ADMIN_KEY = รหัสผู้ดูแลที่ต้องการ
 * 3) เลือกฟังก์ชัน setup > Run (ครั้งแรกจะขออนุญาต กด Allow)
 * 4) Deploy > New deployment > Web app : Execute as = Me, Who has access = Anyone
 * 5) คัดลอก URL ที่ลงท้าย /exec ไปใส่ใน config.js (SHEET_API_URL)
 *
 * แท็บที่ใช้:
 *  - "รายงาน"     : 1 แถว = 1 งาน (เปิดดู/กรอง/ทำ Pivot ได้เลย)
 *  - "ข้อมูลดิบ"   : 1 แถว = 1 รายงาน (เก็บลายเซ็นและข้อมูลเต็ม ใช้ให้เว็บโหลดกลับ)
 */
const SPREADSHEET_ID = '';            // เว้นว่างถ้าสคริปต์ผูกกับชีตอยู่แล้ว
const TZ = 'Asia/Bangkok';
const SH_REPORT = 'รายงาน';
const SH_RAW = 'ข้อมูลดิบ';
const HEAD = ['บันทึกเข้าระบบเมื่อ', 'วันที่ส่ง', 'ชื่อ-นามสกุล', 'รหัสพนักงาน', 'แผนก/ตำแหน่ง', 'วันที่ปฏิบัติงาน',
  'ช่วงเวลา', 'ลำดับ', 'งานที่ทำ', 'จำนวน', 'หน่วย', 'เวลาเริ่ม', 'เวลาเสร็จ', 'ทำร่วมกับ', 'ลงชื่อ', 'ลงวันที่', 'รหัสรายงาน'];
const RAW_HEAD = ['รหัสรายงาน', 'บันทึกเข้าระบบเมื่อ', 'ชื่อ-นามสกุล', 'วันที่ปฏิบัติงาน', 'ข้อมูล (JSON)', 'ลายเซ็น (รูป)'];
const PERIODS = [
  { key: 'p1', name: 'ช่วงที่ 1', time: '08.00 – 12.00 น.' },
  { key: 'p2', name: 'ช่วงที่ 2', time: '13.00 – 17.00 น.' },
  { key: 'ot', name: 'ช่วงที่ 3 · OT', time: '' }
];

/* ---------------- entry points ---------------- */
function doGet() { return json_({ ok: true, app: 'work-report', time: now_() }); }

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'bad json' }); }
  try {
    switch (body.action) {
      case 'submit': return json_(submit_(body.report || {}));
      case 'list':   requireAdmin_(body.key); return json_(list_(body.limit));
      case 'delete': requireAdmin_(body.key); return json_(remove_(String(body.id || '')));
      default:       return json_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ---------------- actions ---------------- */
function submit_(r) {
  if (!r.name || !r.workDate) throw new Error('ข้อมูลไม่ครบ');
  const id = String(r.id || Utilities.getUuid()).slice(0, 40);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const stamp = now_();
    const sig = String(r.signature || '');
    if (sig && !/^data:image\/(png|jpeg);base64,/.test(sig)) throw new Error('ลายเซ็นไม่ถูกต้อง');
    if (sig.length > 48000) throw new Error('ลายเซ็นใหญ่เกินไป');

    // 1) แถวละ 1 งาน
    const rows = [];
    PERIODS.forEach(function (p) {
      const P = (r.periods || {})[p.key];
      if (!P || !P.rows) return;
      const label = p.key === 'ot'
        ? p.name + (P.otStart ? ' ' + P.otStart + '-' + (P.otEnd || '') : '')
        : p.name + ' ' + p.time;
      P.rows.slice(0, 50).forEach(function (x, i) {
        rows.push([stamp, fmtTs_(r.submittedTs), clean_(r.name), clean_(r.code), clean_(r.dept), dmy_(r.workDate),
          label, i + 1, clean_(x.task), x.qty === '' || isNaN(x.qty) ? '' : Number(x.qty), clean_(x.unit),
          clean_(x.start), clean_(x.end), clean_(x.with), clean_(r.signName), dmy_(r.signDate), id]);
      });
    });
    if (!rows.length) throw new Error('ไม่มีรายการงาน');
    const sh = sheet_(SH_REPORT, HEAD);
    const start = sh.getLastRow() + 1;
    const rg = sh.getRange(start, 1, rows.length, HEAD.length);
    rg.setNumberFormat('@');
    sh.getRange(start, HEAD.indexOf('จำนวน') + 1, rows.length, 1).setNumberFormat('0.##');
    rg.setValues(rows);

    // 2) ข้อมูลเต็ม + ลายเซ็น
    const copy = JSON.parse(JSON.stringify(r)); delete copy.signature; copy.id = id;
    sheet_(SH_RAW, RAW_HEAD).appendRow([id, stamp, clean_(r.name), String(r.workDate), JSON.stringify(copy), sig]);
    return { ok: true, id: id, savedAt: stamp, rows: rows.length };
  } finally { lock.releaseLock(); }
}

function list_(limit) {
  const sh = sheet_(SH_RAW, RAW_HEAD);
  const n = sh.getLastRow() - 1;
  if (n <= 0) return { ok: true, reports: [] };
  const take = limit ? Math.min(n, Number(limit)) : Math.min(n, 2000);
  const vals = sh.getRange(sh.getLastRow() - take + 1, 1, take, RAW_HEAD.length).getValues();
  const reports = [];
  vals.forEach(function (v) {
    try { const o = JSON.parse(v[4]); o.id = v[0]; o.signature = v[5]; o.savedAt = v[1]; reports.push(o); } catch (e) {}
  });
  return { ok: true, reports: reports };
}

function remove_(id) {
  if (!id) throw new Error('ไม่มีรหัสรายงาน');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let removed = 0;
    [[SH_REPORT, HEAD.length], [SH_RAW, 1]].forEach(function (t) {
      const sh = sheet_(t[0], t[0] === SH_RAW ? RAW_HEAD : HEAD);
      const last = sh.getLastRow(); if (last < 2) return;
      const ids = sh.getRange(2, t[1], last - 1, 1).getValues();
      for (let i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === id) { sh.deleteRow(i + 2); removed++; }
    });
    return { ok: true, removed: removed };
  } finally { lock.releaseLock(); }
}

/* ---------------- helpers ---------------- */
function requireAdmin_(key) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!real) throw new Error('ยังไม่ได้ตั้ง ADMIN_KEY ใน Script Properties');
  if (String(key || '') !== real) throw new Error('รหัสผู้ดูแลไม่ถูกต้อง (key)');
}
function ss_() { return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name, head) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(head);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#efe9ff');
    sh.setFrozenRows(1);
  }
  return sh;
}
function now_() { return Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss'); }
function fmtTs_(ts) { const d = ts ? new Date(Number(ts)) : new Date(); return Utilities.formatDate(d, TZ, 'dd/MM/yyyy HH:mm:ss'); }
function dmy_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? m[3] + '/' + m[2] + '/' + (Number(m[1]) + 543) : clean_(iso);
}
function clean_(v) {
  v = v == null ? '' : String(v).slice(0, 500);
  return /^[=+\-@]/.test(v) ? "'" + v : v;     // กันการแทรกสูตรลงชีต
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Run ครั้งแรก: สร้างแท็บและหัวตาราง + ขออนุญาตสิทธิ์ */
function setup() { sheet_(SH_REPORT, HEAD); sheet_(SH_RAW, RAW_HEAD); Logger.log('พร้อมใช้งาน'); }

/** ทดสอบบันทึก 1 รายงาน (ลบทิ้งได้ภายหลัง) */
function testSubmit() {
  Logger.log(submit_({ name: 'ทดสอบ ระบบ', code: 'T001', dept: 'ทดสอบ', workDate: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'),
    signName: 'ทดสอบ ระบบ', signDate: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), submittedTs: Date.now(),
    periods: { p1: { rows: [{ task: 'ทดสอบงาน', qty: 10, unit: 'ชิ้น', start: '08:00', end: '09:00', with: '' }] } } }));
}
