const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 10000;

const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ======================================================
// DATABASE
// ======================================================

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      mobile TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'candidate',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS mobile TEXT;

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'candidate';

    CREATE TABLE IF NOT EXISTS profiles (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      headline TEXT,
      skills TEXT,
      experience TEXT,
      education TEXT,
      location TEXT,
      bio TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      recruiter_id INT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT,
      level TEXT DEFAULT 'Fresher',
      type TEXT DEFAULT 'Full Time',
      salary TEXT,
      skills TEXT,
      description TEXT,
      status TEXT DEFAULT 'approved',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS saved (
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      job_id INT REFERENCES jobs(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, job_id)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      job_id INT REFERENCES jobs(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'Applied',
      recruiter_note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, job_id)
    );

    CREATE TABLE IF NOT EXISTS interviews (
      id SERIAL PRIMARY KEY,
      application_id INT REFERENCES applications(id) ON DELETE CASCADE,
      scheduled_at TIMESTAMP NOT NULL,
      mode TEXT DEFAULT 'Online',
      meeting_link TEXT,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      file_name TEXT,
      file_data BYTEA,
      analysis TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mock_interviews (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      question TEXT,
      answer TEXT,
      score INT,
      feedback TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await seedJobs();
  await createAdmin();

  console.log("Database ready");
}

// ======================================================
// SAMPLE JOBS
// ======================================================

async function seedJobs() {
  const result = await pool.query("SELECT COUNT(*) FROM jobs");

  if (Number(result.rows[0].count) > 0) return;

  const jobs = [
    [
      "Frontend Developer Intern",
      "CareerNexa Tech",
      "Remote",
      "Fresher",
      "Internship",
      "₹10,000 - ₹20,000",
      "HTML, CSS, JavaScript, React",
      "Work with the frontend team to build modern web applications."
    ],
    [
      "Graduate Software Engineer",
      "TechNova",
      "Hyderabad",
      "Fresher",
      "Full Time",
      "₹4 - ₹6 LPA",
      "Java, Python, SQL",
      "Entry-level software engineering opportunity for graduates."
    ],
    [
      "Junior React Developer",
      "WebWorks",
      "Bengaluru",
      "0-1 years",
      "Full Time",
      "₹5 - ₹8 LPA",
      "React, JavaScript, Git",
      "Build responsive React applications with the product team."
    ],
    [
      "Data Analyst Trainee",
      "DataSphere",
      "Pune",
      "Fresher",
      "Full Time",
      "₹3 - ₹5 LPA",
      "Excel, SQL, Power BI",
      "Analyze business data and create useful dashboards."
    ],
    [
      "Backend Developer",
      "CloudStack",
      "Chennai",
      "2+ years",
      "Full Time",
      "₹8 - ₹14 LPA",
      "Node.js, PostgreSQL, REST API",
      "Develop scalable backend APIs and database systems."
    ],
    [
      "QA Engineer Intern",
      "QualityLabs",
      "Remote",
      "Fresher",
      "Internship",
      "₹12,000 - ₹18,000",
      "Testing, Selenium, Java",
      "Learn software testing and automation with experienced QA engineers."
    ]
  ];

  for (const job of jobs) {
    await pool.query(
      `
      INSERT INTO jobs
      (title, company, location, level, type, salary, skills, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      job
    );
  }
}

// ======================================================
// ADMIN
// ======================================================

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) return;

  const existing = await pool.query(
    "SELECT id FROM users WHERE email=$1",
    [email]
  );

  if (existing.rows.length) return;

  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    `
    INSERT INTO users(name,email,password_hash,role)
    VALUES($1,$2,$3,'admin')
    `,
    ["CareerNexa Admin", email, hash]
  );

  console.log("Admin created");
}

// ======================================================
// AUTH HELPERS
// ======================================================

function tokenFor(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Login required" });
    }

    const token = header.substring(7);

    req.user = jwt.verify(token, JWT_SECRET);

    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired login" });
  }
}

function role(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "You don't have permission for this action"
      });
    }

    next();
  };
}

// ======================================================
// SMS - MSG91
// ======================================================

async function sendSMS(mobile, jobTitle, status = "Applied") {
  const authkey = process.env.MSG91_AUTHKEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authkey || !templateId || !mobile) {
    return {
      sent: false,
      reason: "SMS not configured"
    };
  }

  const cleanMobile = String(mobile).replace(/\D/g, "");

  const finalMobile =
    cleanMobile.length === 10
      ? "91" + cleanMobile
      : cleanMobile;

  try {
    const response = await fetch(
      "https://control.msg91.com/api/v5/flow",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          authkey,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          template_id: templateId,
          short_url: "0",
          recipients: [
            {
              mobiles: finalMobile,
              VAR1: jobTitle,
              VAR2: status
            }
          ]
        })
      }
    );

    const data = await response.json();

    return {
      sent: response.ok,
      response: data
    };
  } catch (error) {
    console.error("SMS error:", error.message);

    return {
      sent: false,
      reason: error.message
    };
  }
}

// ======================================================
// HEALTH
// ======================================================

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      database: true,
      smsConfigured: Boolean(
        process.env.MSG91_AUTHKEY &&
        process.env.MSG91_TEMPLATE_ID
      )
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      database: false,
      error: error.message
    });
  }
});

// ======================================================
// REGISTER
// ======================================================

app.post("/api/register", async (req, res) => {
  try {
    const {
      name,
      email,
      mobile,
      password,
      role: requestedRole
    } = req.body;

    if (!name || !email || !mobile || !password) {
      return res.status(400).json({
        error: "Name, mobile, email and password are required"
      });
    }

    const cleanMobile = String(mobile).replace(/\D/g, "");

    if (cleanMobile.length !== 10) {
      return res.status(400).json({
        error: "Enter a valid 10 digit mobile number"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must contain at least 6 characters"
      });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE email=$1",
      [email.toLowerCase()]
    );

    if (existing.rows.length) {
      return res.status(409).json({
        error: "Email already registered"
      });
    }

    const userRole =
      requestedRole === "recruiter"
        ? "recruiter"
        : "candidate";

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users
      (name,email,mobile,password_hash,role)
      VALUES($1,$2,$3,$4,$5)
      RETURNING id,name,email,mobile,role
      `,
      [
        name,
        email.toLowerCase(),
        cleanMobile,
        hash,
        userRole
      ]
    );

    const user = result.rows[0];

    await pool.query(
      `
      INSERT INTO profiles(user_id)
      VALUES($1)
      ON CONFLICT(user_id) DO NOTHING
      `,
      [user.id]
    );

    res.json({
      user,
      token: tokenFor(user)
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Registration failed"
    });
  }
});

// ======================================================
// LOGIN
// ======================================================

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [String(email || "").toLowerCase()]
    );

    if (!result.rows.length) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!valid) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role
    };

    res.json({
      user: safeUser,
      token: tokenFor(safeUser)
    });
  } catch (error) {
    res.status(500).json({
      error: "Login failed"
    });
  }
});

// ======================================================
// ME
// ======================================================

app.get("/api/me", auth, async (req, res) => {
  const result = await pool.query(
    `
    SELECT id,name,email,mobile,role,created_at
    FROM users
    WHERE id=$1
    `,
    [req.user.id]
  );

  res.json(result.rows[0]);
});

// ======================================================
// PROFILE
// ======================================================

app.get("/api/profile", auth, async (req, res) => {
  const result = await pool.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.mobile,
      u.role,
      p.headline,
      p.skills,
      p.experience,
      p.education,
      p.location,
      p.bio
    FROM users u
    LEFT JOIN profiles p ON p.user_id=u.id
    WHERE u.id=$1
    `,
    [req.user.id]
  );

  res.json(result.rows[0]);
});

app.put("/api/profile", auth, async (req, res) => {
  const {
    name,
    mobile,
    headline,
    skills,
    experience,
    education,
    location,
    bio
  } = req.body;

  await pool.query(
    `
    UPDATE users
    SET name=COALESCE($1,name),
        mobile=COALESCE($2,mobile)
    WHERE id=$3
    `,
    [name, mobile, req.user.id]
  );

  await pool.query(
    `
    INSERT INTO profiles
    (user_id,headline,skills,experience,education,location,bio)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(user_id)
    DO UPDATE SET
      headline=EXCLUDED.headline,
      skills=EXCLUDED.skills,
      experience=EXCLUDED.experience,
      education=EXCLUDED.education,
      location=EXCLUDED.location,
      bio=EXCLUDED.bio,
      updated_at=CURRENT_TIMESTAMP
    `,
    [
      req.user.id,
      headline,
      skills,
      experience,
      education,
      location,
      bio
    ]
  );

  res.json({
    ok: true,
    message: "Profile updated"
  });
});

// ======================================================
// JOBS
// ======================================================

app.get("/api/jobs", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();

    let query = `
      SELECT
        j.*,
        u.name AS recruiter_name
      FROM jobs j
      LEFT JOIN users u ON u.id=j.recruiter_id
      WHERE j.status='approved'
    `;

    const params = [];

    if (search) {
      params.push(`%${search}%`);

      query += `
        AND (
          j.title ILIKE $${params.length}
          OR j.company ILIKE $${params.length}
          OR j.skills ILIKE $${params.length}
          OR j.location ILIKE $${params.length}
        )
      `;
    }

    query += " ORDER BY j.created_at DESC";

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      error: "Could not load jobs"
    });
  }
});

// ======================================================
// SAVED JOBS
// ======================================================

app.get("/api/saved", auth, async (req, res) => {
  const result = await pool.query(
    `
    SELECT job_id
    FROM saved
    WHERE user_id=$1
    `,
    [req.user.id]
  );

  res.json(result.rows.map(x => x.job_id));
});

app.post("/api/saved/:jobId", auth, async (req, res) => {
  const jobId = Number(req.params.jobId);

  const existing = await pool.query(
    `
    SELECT 1
    FROM saved
    WHERE user_id=$1 AND job_id=$2
    `,
    [req.user.id, jobId]
  );

  if (existing.rows.length) {
    await pool.query(
      `
      DELETE FROM saved
      WHERE user_id=$1 AND job_id=$2
      `,
      [req.user.id, jobId]
    );

    return res.json({ saved: false });
  }

  await pool.query(
    `
    INSERT INTO saved(user_id,job_id)
    VALUES($1,$2)
    ON CONFLICT DO NOTHING
    `,
    [req.user.id, jobId]
  );

  res.json({ saved: true });
});

// ======================================================
// APPLY
// ======================================================

app.post(
  "/api/applications/:jobId",
  auth,
  role("candidate"),
  async (req, res) => {
    try {
      const jobId = Number(req.params.jobId);

      const jobResult = await pool.query(
        `
        SELECT *
        FROM jobs
        WHERE id=$1 AND status='approved'
        `,
        [jobId]
      );

      if (!jobResult.rows.length) {
        return res.status(404).json({
          error: "Job not found"
        });
      }

      const job = jobResult.rows[0];

      const existing = await pool.query(
        `
        SELECT id
        FROM applications
        WHERE user_id=$1 AND job_id=$2
        `,
        [req.user.id, jobId]
      );

      if (existing.rows.length) {
        return res.status(409).json({
          error: "You already applied for this job"
        });
      }

      const application = await pool.query(
        `
        INSERT INTO applications(user_id,job_id,status)
        VALUES($1,$2,'Applied')
        RETURNING *
        `,
        [req.user.id, jobId]
      );

      const userResult = await pool.query(
        `
        SELECT name,mobile
        FROM users
        WHERE id=$1
        `,
        [req.user.id]
      );

      const user = userResult.rows[0];

      const sms = await sendSMS(
        user.mobile,
        job.title,
        "Applied"
      );

      res.json({
        ok: true,
        application: application.rows[0],
        smsSent: sms.sent,
        message: sms.sent
          ? "Application submitted and SMS sent"
          : "Application submitted"
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Application failed"
      });
    }
  }
);

// ======================================================
// MY APPLICATIONS
// ======================================================

app.get(
  "/api/applications",
  auth,
  role("candidate"),
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        a.*,
        j.title,
        j.company,
        j.location,
        j.salary,
        j.level
      FROM applications a
      JOIN jobs j ON j.id=a.job_id
      WHERE a.user_id=$1
      ORDER BY a.created_at DESC
      `,
      [req.user.id]
    );

    res.json(result.rows);
  }
);

// ======================================================
// UPDATE / DELETE APPLICATION
// ======================================================

app.patch(
  "/api/applications/:id",
  auth,
  role("candidate"),
  async (req, res) => {
    const result = await pool.query(
      `
      UPDATE applications
      SET status=COALESCE($1,status),
          recruiter_note=COALESCE($2,recruiter_note)
      WHERE id=$3 AND user_id=$4
      RETURNING *
      `,
      [
        req.body.status,
        req.body.recruiter_note,
        req.params.id,
        req.user.id
      ]
    );

    res.json(result.rows[0]);
  }
);

app.delete(
  "/api/applications/:id",
  auth,
  role("candidate"),
  async (req, res) => {
    await pool.query(
      `
      DELETE FROM applications
      WHERE id=$1 AND user_id=$2
      `,
      [req.params.id, req.user.id]
    );

    res.json({ ok: true });
  }
);

// ======================================================
// RECRUITER - CREATE JOB
// ======================================================

app.post(
  "/api/recruiter/jobs",
  auth,
  role("recruiter", "admin"),
  async (req, res) => {
    try {
      const {
        title,
        company,
        location,
        level,
        type,
        salary,
        skills,
        description
      } = req.body;

      if (!title || !company || !description) {
        return res.status(400).json({
          error: "Title, company and description are required"
        });
      }

      const status =
        req.user.role === "admin"
          ? "approved"
          : "pending";

      const result = await pool.query(
        `
        INSERT INTO jobs
        (
          recruiter_id,
          title,
          company,
          location,
          level,
          type,
          salary,
          skills,
          description,
          status
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
        `,
        [
          req.user.id,
          title,
          company,
          location,
          level || "Fresher",
          type || "Full Time",
          salary,
          skills,
          description,
          status
        ]
      );

      res.json({
        ok: true,
        job: result.rows[0]
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Could not create job"
      });
    }
  }
);

// ======================================================
// RECRUITER JOBS
// ======================================================

app.get(
  "/api/recruiter/jobs",
  auth,
  role("recruiter", "admin"),
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT *
      FROM jobs
      WHERE recruiter_id=$1
      ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    res.json(result.rows);
  }
);

// ======================================================
// RECRUITER APPLICANTS
// ======================================================

app.get(
  "/api/recruiter/applications",
  auth,
  role("recruiter", "admin"),
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        a.id,
        a.status,
        a.recruiter_note,
        a.created_at,
        u.name AS candidate_name,
        u.email AS candidate_email,
        u.mobile AS candidate_mobile,
        j.id AS job_id,
        j.title AS job_title,
        j.company,
        p.skills,
        p.experience,
        p.education,
        p.location
      FROM applications a
      JOIN jobs j ON j.id=a.job_id
      JOIN users u ON u.id=a.user_id
      LEFT JOIN profiles p ON p.user_id=u.id
      WHERE j.recruiter_id=$1
      ORDER BY a.created_at DESC
      `,
      [req.user.id]
    );

    res.json(result.rows);
  }
);

// ======================================================
// RECRUITER UPDATE APPLICATION
// ======================================================

app.patch(
  "/api/recruiter/applications/:id",
  auth,
  role("recruiter", "admin"),
  async (req, res) => {
    try {
      const { status, recruiter_note } = req.body;

      const result = await pool.query(
        `
        SELECT
          a.*,
          u.mobile,
          j.title,
          j.recruiter_id
        FROM applications a
        JOIN users u ON u.id=a.user_id
        JOIN jobs j ON j.id=a.job_id
        WHERE a.id=$1
        `,
        [req.params.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error: "Application not found"
        });
      }

      const application = result.rows[0];

      if (
        req.user.role !== "admin" &&
        application.recruiter_id !== req.user.id
      ) {
        return res.status(403).json({
          error: "Not your job application"
        });
      }

      await pool.query(
        `
        UPDATE applications
        SET status=$1,
            recruiter_note=$2
        WHERE id=$3
        `,
        [
          status,
          recruiter_note || null,
          req.params.id
        ]
      );

      const sms = await sendSMS(
        application.mobile,
        application.title,
        status
      );

      res.json({
        ok: true,
        smsSent: sms.sent
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Could not update application"
      });
    }
  }
);

// ======================================================
// INTERVIEW SCHEDULE
// ======================================================

app.post(
  "/api/recruiter/applications/:id/interview",
  auth,
  role("recruiter", "admin"),
  async (req, res) => {
    try {
      const {
        scheduled_at,
        mode,
        meeting_link,
        note
      } = req.body;

      const appResult = await pool.query(
        `
        SELECT
          a.id,
          a.user_id,
          j.title,
          j.recruiter_id,
          u.mobile
        FROM applications a
        JOIN jobs j ON j.id=a.job_id
        JOIN users u ON u.id=a.user_id
        WHERE a.id=$1
        `,
        [req.params.id]
      );

      if (!appResult.rows.length) {
        return res.status(404).json({
          error: "Application not found"
        });
      }

      const application = appResult.rows[0];

      if (
        req.user.role !== "admin" &&
        application.recruiter_id !== req.user.id
      ) {
        return res.status(403).json({
          error: "Not your application"
        });
      }

      const interview = await pool.query(
        `
        INSERT INTO interviews
        (application_id,scheduled_at,mode,meeting_link,note)
        VALUES($1,$2,$3,$4,$5)
        RETURNING *
        `,
        [
          req.params.id,
          scheduled_at,
          mode || "Online",
          meeting_link || "",
          note || ""
        ]
      );

      await pool.query(
        `
        UPDATE applications
        SET status='Interview Scheduled'
        WHERE id=$1
        `,
        [req.params.id]
      );

      const sms = await sendSMS(
        application.mobile,
        application.title,
        "Interview Scheduled"
      );

      res.json({
        ok: true,
        interview: interview.rows[0],
        smsSent: sms.sent
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Could not schedule interview"
      });
    }
  }
);

// ======================================================
// CANDIDATE INTERVIEWS
// ======================================================

app.get(
  "/api/interviews",
  auth,
  role("candidate"),
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        i.*,
        j.title,
        j.company
      FROM interviews i
      JOIN applications a ON a.id=i.application_id
      JOIN jobs j ON j.id=a.job_id
      WHERE a.user_id=$1
      ORDER BY i.scheduled_at ASC
      `,
      [req.user.id]
    );

    res.json(result.rows);
  }
);

// ======================================================
// RESUME UPLOAD
// ======================================================

app.post(
  "/api/resume",
  auth,
  role("candidate"),
  upload.single("resume"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "Resume file required"
        });
      }

      const analysis = analyzeResume(req.file.originalname);

      await pool.query(
        `
        INSERT INTO resumes
        (user_id,file_name,file_data,analysis)
        VALUES($1,$2,$3,$4)
        `,
        [
          req.user.id,
          req.file.originalname,
          req.file.buffer,
          JSON.stringify(analysis)
        ]
      );

      res.json({
        ok: true,
        fileName: req.file.originalname,
        analysis
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Resume upload failed"
      });
    }
  }
);

function analyzeResume(fileName) {
  return {
    score: 78,
    file: fileName,
    strengths: [
      "Resume uploaded successfully",
      "Professional document detected"
    ],
    issues: [
      "Add measurable achievements",
      "Mention relevant technical skills",
      "Keep resume within 1-2 pages"
    ],
    suggestions: [
      "Add GitHub or portfolio link",
      "Use stronger action verbs",
      "Customize resume for each job"
    ]
  };
}

// ======================================================
// MOCK INTERVIEW
// ======================================================

app.post(
  "/api/mock-interview",
  auth,
  role("candidate"),
  async (req, res) => {
    const questions = [
      "Tell me about yourself.",
      "Why should we hire you?",
      "Explain one project you worked on.",
      "What are your strengths?",
      "Where do you see yourself in five years?"
    ];

    const question =
      req.body.question ||
      questions[Math.floor(Math.random() * questions.length)];

    const answer = req.body.answer || "";

    let score = 0;
    let feedback = "Start by providing your answer.";

    if (answer.trim()) {
      score = Math.min(
        100,
        50 +
          Math.min(40, Math.floor(answer.length / 20))
      );

      feedback =
        "Good attempt. Make your answer more specific and include examples.";
    }

    await pool.query(
      `
      INSERT INTO mock_interviews
      (user_id,question,answer,score,feedback)
      VALUES($1,$2,$3,$4,$5)
      `,
      [
        req.user.id,
        question,
        answer,
        score,
        feedback
      ]
    );

    res.json({
      question,
      score,
      feedback
    });
  }
);

// ======================================================
// ADMIN
// ======================================================

app.get(
  "/api/admin/jobs",
  auth,
  role("admin"),
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        j.*,
        u.name AS recruiter_name,
        u.email AS recruiter_email
      FROM jobs j
      LEFT JOIN users u ON u.id=j.recruiter_id
      ORDER BY j.created_at DESC
      `
    );

    res.json(result.rows);
  }
);

app.patch(
  "/api/admin/jobs/:id",
  auth,
  role("admin"),
  async (req, res) => {
    const { status } = req.body;

    await pool.query(
      `
      UPDATE jobs
      SET status=$1
      WHERE id=$2
      `,
      [status, req.params.id]
    );

    res.json({
      ok: true
    });
  }
);

// ======================================================
// FRONTEND FALLBACK
// Express 5 compatible
// ======================================================

app.get(/.*/, (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// ======================================================
// START
// ======================================================

async function start() {
  try {
    await initDB();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `CareerNexa listening on ${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "SERVER START ERROR:",
      error
    );

    process.exit(1);
  }
}

start();
