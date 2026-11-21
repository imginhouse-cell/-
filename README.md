# 🌈 รายงานการปฏิบัติงานส่วนบุคคล

**เวอร์ชัน v2.0.0** · [ประวัติการอัปเดต](CHANGELOG.md) · เว็บ: https://imginhouse-cell.github.io/-/

พนักงาน **เข้าสู่ระบบด้วย Google (Gmail)** แล้วกรอกรายงานงานประจำวัน 3 ช่วงเวลา กด **ส่งรายงาน** ข้อมูลเก็บใน **Supabase** พร้อมวัน/เวลาที่ส่ง (เวลาจากเซิร์ฟเวอร์ ปลอมไม่ได้)
ใช้ได้ทั้งมือถือ แท็บเล็ต คอมพิวเตอร์

| ช่วง | เวลา |
|---|---|
| ช่วงที่ 1 | 08.00 – 12.00 น. |
| ช่วงที่ 2 | 13.00 – 17.00 น. |
| ช่วงที่ 3 · OT | ระบุเวลาที่ทำเอง |

แต่ละงาน: **ลำดับ · งานที่ทำ · จำนวนที่ผลิต/ปฏิบัติได้ (+หน่วย) · เวลาเริ่ม · เวลาเสร็จ · ทำร่วมกับใคร** ท้ายรายงานมี **ลายเซ็น + ชื่อผู้ลงนาม + ลงวันที่**

## สิทธิ์การใช้งาน

| ผู้ใช้ | ทำอะไรได้ |
|---|---|
| พนักงาน (ล็อกอินด้วย Gmail ของตัวเอง) | ส่งรายงาน · ดูรายงานของตัวเองเท่านั้น |
| ผู้ดูแล `img.inhouse@gmail.com` | ดูรายงานทุกคน · กรองตามพนักงาน/วันที่ · แท็บสรุปผล · ลบ · Export |

สิทธิ์ถูกบังคับที่ฐานข้อมูลด้วย Row Level Security ไม่ใช่แค่ซ่อนบนหน้าเว็บ
เพิ่มผู้ดูแล: Supabase > SQL Editor > `insert into public.admins(email) values ('อีเมล@gmail.com');`

## ไฟล์

```
├── index.html            ← หน้าเว็บทั้งหมด (ล็อกอิน + ฟอร์ม + รายงาน + สรุป)
├── config.js             ← SUPABASE_URL และ publishable key
├── supabase/schema.sql   ← ตาราง, RLS, view report_items (ติดตั้งแล้ว)
├── CHANGELOG.md
└── .nojekyll
```

## Supabase (ตั้งค่าแล้ว)

- โปรเจกต์ **work-report** (สิงคโปร์) · `https://gkswpadxemksdrpaxyel.supabase.co`
- ตาราง `reports`, `profiles`, `admins` และ view `report_items` (1 แถว = 1 งาน)
- ดูข้อมูล: Supabase > Table Editor > `reports` หรือ `report_items` → Export CSV ได้

### เปิดล็อกอินด้วย Google (ทำครั้งเดียว)

1. **Google Cloud Console** → APIs & Services → Credentials → *Create credentials* → **OAuth client ID** → Web application
   - Authorized JavaScript origins: `https://imginhouse-cell.github.io`
   - Authorized redirect URIs: `https://gkswpadxemksdrpaxyel.supabase.co/auth/v1/callback`
2. คัดลอก **Client ID** และ **Client secret**
3. **Supabase** → Authentication → Sign In / Providers → **Google** → Enable → วาง Client ID / Secret → Save
4. **Supabase** → Authentication → URL Configuration
   - Site URL: `https://imginhouse-cell.github.io/-/`
   - Redirect URLs: `https://imginhouse-cell.github.io/-/**`

> ระหว่างที่ยังไม่เปิด Google ใช้ปุ่ม “รับลิงก์ทางอีเมล” ได้ (อีเมลระบบของ Supabase ส่งได้จำนวนจำกัดต่อชั่วโมง เหมาะกับทดสอบ)

## ความปลอดภัย

- `config.js` มีเฉพาะ **publishable key** ซึ่งเปิดเผยได้ ห้ามใส่ `service_role` / secret key ลงใน repo
- ผู้ส่ง อีเมล และเวลาที่ส่ง ถูกกำหนดโดย trigger ในฐานข้อมูล
