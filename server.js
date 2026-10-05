const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });
    next();
});

app.use(express.static(path.join(__dirname)));

const dataPath = path.join(__dirname, 'data', 'students.json');

function getStudents() {
    try {
        const data = fs.readFileSync(dataPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

function saveStudents(students) {
    fs.writeFileSync(dataPath, JSON.stringify(students, null, 2), 'utf8');
}

// Map both / and /students to the main portfolio page
app.get(['/', '/students'], (req, res) => {
    const students = getStudents();
    const error = req.query.error;
    res.render('index', { students, error });
});

app.post('/students', (req, res) => {
    const { name, role, bio, email, tech_stack } = req.body;
    
    if (!name || name.trim() === '') {
        return res.redirect('/#team-form-section');
    }
    if (!role || role.trim() === '') {
        return res.redirect('/#team-form-section');
    }
    if (!bio || bio.trim() === '') {
        return res.redirect('/#team-form-section');
    }
    if (!email || email.trim() === '') {
        return res.redirect('/#team-form-section');
    }

    const newStudent = {
        id: Date.now().toString(),
        name: name.trim(),
        role: role.trim(),
        badge: "HCMUS Undergraduate Student",
        bio: bio.trim(),
        email: email.trim(),
        stack: tech_stack ? tech_stack.split(',').map(s => s.trim()).filter(s => s) : [],
        avatar: "assets/images/person1.svg", // Default avatar
        term_title: `${name.toLowerCase().replace(/\s+/g, '')}@hcmus: ~/workspace`,
        term_tag: "DEV"
    };

    const students = getStudents();
    students.push(newStudent);
    saveStudents(students);

    res.redirect('/#team');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
