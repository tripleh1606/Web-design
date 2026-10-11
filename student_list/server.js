const express = require('express');
const fs = require('fs');
const path = require('path');
const validator = require('validator');

function summarize(students) {
  const withStudentId = students.filter(student => String(student.studentId || '').trim()).length;
  return { total: students.length, withStudentId, missingStudentId: students.length - withStudentId };
}

function formValues(body = {}) {
  const values = {};
  for (const field of ['studentId', 'name', 'email']) {
    values[field] = typeof body[field] === 'string' ? body[field].trim() : '';
  }
  return values;
}

function validate(values, students) {
  const { studentId, name, email } = values;
  const failure = (status, field, message) => ({ status, field, message });
  if (!studentId) return failure(400, 'studentId', 'Vui lòng nhập mã số sinh viên.');
  if (!/^\d{8}$/.test(studentId)) return failure(400, 'studentId', 'Mã số sinh viên phải gồm đúng 8 chữ số.');
  if (students.some(student => student.studentId === studentId)) {
    return failure(409, 'studentId', 'Mã số sinh viên này đã có trong danh bạ.');
  }
  if (!name) return failure(400, 'name', 'Vui lòng nhập họ tên.');
  if (name.length < 2 || name.length > 100) return failure(400, 'name', 'Họ tên phải có độ dài từ 2 đến 100 ký tự.');
  if (!/^[\p{L}\s'.-]+$/u.test(name)) {
    return failure(400, 'name', 'Họ tên chỉ được chứa chữ, khoảng trắng, dấu nháy đơn, dấu chấm và dấu gạch ngang.');
  }
  if (!email) return failure(400, 'email', 'Vui lòng nhập email.');
  if (/\s/.test(email) || email.length > 254 || !validator.isEmail(email)) {
    return failure(400, 'email', 'Email chưa đúng định dạng. Ví dụ: minh@gmail.com.');
  }
  if (students.some(student => student.email.trim().toLowerCase() === email.toLowerCase())) {
    return failure(409, 'email', 'Email này đã có trong danh bạ.');
  }
  return null;
}

function createApp({
  studentsFile = path.join(__dirname, 'data', 'students.json'),
  storage = fs.promises,
  logRequests = true,
} = {}) {
  const app = express();
  let saveQueue = Promise.resolve();

  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three', 'build'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(path.join(__dirname, 'public')));
  if (logRequests) {
    app.use((req, res, next) => {
      console.log(req.method + ' ' + req.originalUrl);
      next();
    });
  }

  async function readStudents() {
    const students = JSON.parse(await storage.readFile(studentsFile, 'utf8'));
    if (!Array.isArray(students)) throw new Error('Invalid student directory');
    return students;
  }

  app.get('/', (req, res) => res.redirect(302, '/students'));
  app.get('/students', (req, res) => res.sendFile(path.join(__dirname, 'public', 'students.html')));
  app.get('/api/students', async (req, res) => {
    try {
      const students = await readStudents();
      res.set('Cache-Control', 'no-store');
      return res.json({
        students: students.slice().sort((a, b) => Number(b.id) - Number(a.id)),
        summary: summarize(students),
      });
    } catch (error) {
      if (logRequests) console.error('Cannot load directory:', error.message);
      return res.status(500).json({ error: { field: null, message: 'Chưa tải được danh bạ. Vui lòng thử lại.' } });
    }
  });

  const createStudent = async (req, res) => {
    const values = formValues(req.body);
    // Serialize read/validate/write so overlapping requests cannot lose records.
    const task = saveQueue.then(async () => {
      let students;
      try {
        students = await readStudents();
      } catch (error) {
        if (logRequests) console.error('Cannot load directory:', error.message);
        return res.status(500).json({ error: { field: null, message: 'Chưa tải được danh bạ. Vui lòng thử lại.' } });
      }
      const invalid = validate(values, students);
      if (invalid) return res.status(invalid.status).json({ error: { field: invalid.field, message: invalid.message } });
      const nextId = students.length ? Math.max(...students.map(student => Number(student.id))) + 1 : 1;
      const student = { id: nextId, studentId: values.studentId, name: values.name, email: values.email.toLowerCase() };
      const updated = students.concat(student);
      try {
        await storage.writeFile(studentsFile, JSON.stringify(updated, null, 2), 'utf8');
      } catch (error) {
        if (logRequests) console.error('Cannot save student:', error.message);
        return res.status(500).json({ error: { field: null, message: 'Không thể lưu hồ sơ lúc này. Dữ liệu bạn nhập vẫn được giữ lại.' } });
      }
      return res.status(201).json({ student, summary: summarize(updated) });
    });
    saveQueue = task.catch(() => {});
    await task;
  };
  app.post('/api/students', createStudent);
  app.post('/students', createStudent);

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (logRequests) console.error('Request failed:', error.message);
    const status = error.status === 413 ? 413 : 500;
    return res.status(status).json({ error: { field: null, message:
      status === 413 ? 'Nội dung gửi quá dài. Vui lòng kiểm tra lại các trường nhập.'
        : 'Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.' } });
  });
  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log('Academia đang chạy tại http://localhost:' + port + '/students'));
}
module.exports = { createApp };
