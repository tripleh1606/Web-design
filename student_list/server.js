const express = require('express');
const fs = require('fs');
const path = require('path');
const validator = require('validator');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/students', (req, res, next) => {
  const studentsFile = path.join(__dirname, 'data', 'students.json');

  fs.readFile(studentsFile, 'utf8', (error, data) => {
    if (error) {
      return next(error);
    }

    try {
      const students = JSON.parse(data);
      res.render('students', { students, error: null });
    } catch (parseError) {
      next(parseError);
    }
  });
});

app.post('/students', (req, res, next) => {
  const studentsFile = path.join(__dirname, 'data', 'students.json');
  const studentId = req.body.studentId?.trim();
  const name = req.body.name?.trim();
  const email = req.body.email?.trim();
  const studentIdPattern = /^\d{8}$/;
  const namePattern = /^[\p{L}\s'.-]+$/u;

  fs.readFile(studentsFile, 'utf8', (readError, data) => {
    if (readError) {
      return next(readError);
    }

    let students;

    try {
      students = JSON.parse(data);
    } catch (parseError) {
      return next(parseError);
    }

    if (!studentId) {
      return res.status(400).render('students', {
        students,
        error: 'Student ID không được để trống.',
      });
    }

    if (!studentIdPattern.test(studentId)) {
      return res.status(400).render('students', {
        students,
        error: 'Student ID phải gồm đúng 8 chữ số.',
      });
    }

    const studentIdExists = students.some(
      (student) => student.studentId === studentId,
    );

    if (studentIdExists) {
      return res.status(409).render('students', {
        students,
        error: 'Student ID already exists.',
      });
    }

    if (!name) {
      return res.status(400).render('students', {
        students,
        error: 'Name không được để trống.',
      });
    }

    if (name.length < 2 || name.length > 100) {
      return res.status(400).render('students', {
        students,
        error: 'Name phải có độ dài từ 2 đến 100 ký tự.',
      });
    }

    if (!namePattern.test(name)) {
      return res.status(400).render('students', {
        students,
        error: "Name chỉ được chứa chữ, khoảng trắng, dấu nháy đơn, dấu chấm và dấu gạch ngang.",
      });
    }

    if (!email) {
      return res.status(400).render('students', {
        students,
        error: 'Email không được để trống.',
      });
    }

    if (/\s/.test(email) || email.length > 254 || !validator.isEmail(email)) {
      return res.status(400).render('students', {
        students,
        error: 'Email không đúng định dạng. Ví dụ hợp lệ: minh@gmail.com.',
      });
    }

    const normalizedEmail = email.toLowerCase();

    const emailExists = students.some(
      (student) => student.email.trim().toLowerCase() === normalizedEmail,
    );

    if (emailExists) {
      return res.status(409).render('students', {
        students,
        error: 'Email already exists.',
      });
    }

    const nextId = students.length > 0
      ? Math.max(...students.map((student) => student.id)) + 1
      : 1;

    students.push({ id: nextId, studentId, name, email: normalizedEmail });

    fs.writeFile(studentsFile, JSON.stringify(students, null, 2), 'utf8', (writeError) => {
      if (writeError) {
        return next(writeError);
      }

      res.redirect(303, '/students');
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
