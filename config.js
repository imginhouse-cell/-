/* ตั้งค่าเว็บรายงานการปฏิบัติงาน
 * SHEET_API_URL : URL ของ Google Apps Script Web App (ลงท้ายด้วย /exec)
 * SHEET_VIEW_URL: ลิงก์เปิด Google Sheet สำหรับผู้ดูแล (ไม่บังคับ)
 * ถ้าเว้นว่าง SHEET_API_URL เว็บจะทำงานโหมดทดลอง เก็บข้อมูลในเครื่องเท่านั้น */
window.APP_CONFIG = {
  SHEET_API_URL: '',
  SHEET_VIEW_URL: ''
};
window.APP_VERSION = '1.0.0';
