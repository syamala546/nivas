const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Pool } = require("pg");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;
const SECRET = process.env.JWT_SECRET || "change-this-secret";

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    })
  : null;

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

async function q(sql, params = []) {
  if (!pool) {
    throw new Error("DATABASE_URL is missing.");
  }

  return pool.query(sql, params);
}

/* =====================================================
   DATABASE
===================================================== */

async function init() {
  if (!pool) {
    throw new Error("DATABASE_URL is missing.");
  }

  /* USERS */

  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'candidate',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await q(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'candidate'
  `);

  await q(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
  `);

  /* PROFILES */

  await q(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      experience TEXT DEFAULT 'Fresher',
      role TEXT DEFAULT '',
      location TEXT DEFAULT '',
      skills TEXT DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await q(`
    ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS experience TEXT DEFAULT 'Fresher'
  `);

  await q(`
    ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT ''
  `);

  await q(`
    ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS location TEXT DEFAULT ''
  `);

  await q(`
    ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS skills TEXT DEFAULT ''
  `);

  /* JOBS */

  await q(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      recruiter_id INT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT DEFAULT '',
      level TEXT DEFAULT 'Fresher',
      type TEXT DEFAULT 'Full-time',
      salary TEXT DEFAULT '',
      skills TEXT DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'approved',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await q(`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS recruiter_id INT
  `);

  await q(`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved'
  `);

  await q(`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
  `);

  /* SAVED JOBS */

  await q(`
    CREATE TABLE IF NOT EXISTS saved (
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      job_id INT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(user_id, job_id)
    )
  `);

  /* APPLICATIONS */

  await q(`
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      job_id INT,
      status TEXT DEFAULT 'Applied',
      recruiter_note TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, job_id)
    )
  `);

  await q(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS recruiter_note TEXT DEFAULT ''
  `);

  /* RESUMES */

  await q(`
    CREATE TABLE IF NOT EXISTS resumes (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      filename TEXT,
      analysis JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  /* INTERVIEWS */

  await q(`
    CREATE TABLE IF NOT EXISTS interviews (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      role TEXT,
      score INT,
      answers JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  /* DEFAULT JOBS */

  const defaultJobs = [
    [
      "Frontend Developer Intern",
      "PixelSpring",
      "Hyderabad / Remote",
      "Fresher",
      "Internship",
      "₹15k–₹25k/month",
      ["HTML", "CSS", "JavaScript", "React"],
      "Entry-level frontend role with mentorship."
    ],
    [
      "Graduate Software Engineer",
      "Northstar Labs",
      "Bengaluru",
      "Fresher",
      "Full-time",
      "₹4–7 LPA",
      ["Java", "SQL", "Git"],
      "Graduate engineering role with training."
    ],
    [
      "Junior React Developer",
      "CloudMint",
      "Remote",
      "0–1 years",
      "Full-time",
      "₹5–8 LPA",
      ["React", "JavaScript", "TypeScript"],
      "Build modern frontend experiences."
    ],
    [
      "Data Analyst Trainee",
      "MetricLeaf",
      "Chennai",
      "Fresher",
      "Trainee",
      "₹3–5 LPA",
      ["SQL", "Excel", "Python"],
      "Reporting and data quality projects."
    ],
    [
      "Backend Developer",
      "StackHarbor",
      "Pune",
      "2+ years",
      "Full-time",
      "₹10–16 LPA",
      ["Node.js", "PostgreSQL", "APIs"],
      "Backend services role requiring experience."
    ],
    [
      "QA Engineer Intern",
      "BrightTest",
      "Remote",
      "Fresher",
      "Internship",
      "₹12k–₹20k/month",
      ["Testing", "SQL", "JavaScript"],
      "Learn testing, bug reporting, and automation."
    ],
  ];

  for (const j of defaultJobs) {
    await q(
      `
      INSERT INTO jobs
      (title, company, location, level, type, salary, skills, description, status)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,'approved'
      WHERE NOT EXISTS (
        SELECT 1 FROM jobs
        WHERE title=$1 AND company=$2
      )
      `,
      [
        j[0],
        j[1],
        j[2],
        j[3],
        j[4],
        j[5],
        JSON.stringify(j[6]),
        j[7],
      ]
    );
  }

  console.log("Database initialized successfully.");
}

/* =====================================================
   AUTH
===================================================== */

function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    const token = header.replace(/^Bearer /, "");

    if (!token) {
      return res.status(401).json({
        error: "Please log in.",
      });
    }

    req.user = jwt.verify(token, SECRET);

    next();
  } catch (e) {
    return res.status(401).json({
      error: "Session expired. Please log in again.",
    });
  }
}

function makeToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role || "candidate",
    },
    SECRET,
    {
      expiresIn: "7d",
    }
  );
}

/* =====================================================
   HEALTH
===================================================== */

app.get("/api/health", async (req, res) => {
  try {
    await q("SELECT 1");

    res.json({
      ok: true,
      database: true,
      message: "CareerNexa server is running.",
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      database: false,
      error: e.message,
    });
  }
});

/* =====================================================
   REGISTER
===================================================== */

app.post("/api/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const requestedRole = String(req.body.role || "candidate").toLowerCase();

    if (!name) {
      return res.status(400).json({
        error: "Please enter your name.",
      });
    }

    if (!email) {
      return res.status(400).json({
        error: "Please enter your email.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must contain at least 8 characters.",
      });
    }

    /* Public users can only create candidate/recruiter accounts */

    const role =
      requestedRole === "recruiter"
        ? "recruiter"
        : "candidate";

    const existing = await q(
      "SELECT id FROM users WHERE email=$1",
      [email]
    );

    if (existing.rowCount) {
      return res.status(409).json({
        error: "This email is already registered. Please log in.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await q(
      `
      INSERT INTO users
      (name,email,password_hash,role)
      VALUES($1,$2,$3,$4)
      RETURNING id,name,email,role
      `,
      [
        name,
        email,
        passwordHash,
        role,
      ]
    );

    const user = result.rows[0];

    await q(
      `
      INSERT INTO profiles
      (user_id)
      VALUES($1)
      ON CONFLICT(user_id) DO NOTHING
      `,
      [user.id]
    );

    const token = makeToken(user);

    res.json({
      token,
      user,
      message: "Account created successfully!",
    });

  } catch (e) {
    console.error("REGISTER ERROR:", e);

    res.status(500).json({
      error: "Registration failed. Please try again.",
    });
  }
});

/* =====================================================
   LOGIN
===================================================== */

app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    const result = await q(
      `
      SELECT id,name,email,password_hash,role
      FROM users
      WHERE email=$1
      `,
      [email]
    );

    const user = result.rows[0];

    if (
      !user ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        error: "Email or password is incorrect.",
      });
    }

    const publicUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || "candidate",
    };

    res.json({
      token: makeToken(publicUser),
      user: publicUser,
      message: "Login successful!",
    });

  } catch (e) {
    console.error("LOGIN ERROR:", e);

    res.status(500).json({
      error: "Login failed. Please try again.",
    });
  }
});

/* =====================================================
   CURRENT USER
===================================================== */

app.get("/api/me", auth, async (req, res) => {
  try {
    const result = await q(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        u.role AS account_role,
        p.experience,
        p.role AS preferred_role,
        p.location,
        p.skills
      FROM users u
      LEFT JOIN profiles p
        ON p.user_id=u.id
      WHERE u.id=$1
      `,
      [req.user.id]
    );

    const u = result.rows[0];

    if (!u) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    res.json({
      id: u.id,
      name: u.name,
      email: u.email,

      /* Account role */
      role: u.account_role || "candidate",

      /* Profile information */
      experience: u.experience || "Fresher",
      preferredRole: u.preferred_role || "",
      location: u.location || "",
      skills: u.skills || "",
    });

  } catch (e) {
    console.error("ME ERROR:", e);

    res.status(500).json({
      error: "Could not load your profile.",
    });
  }
});

/* =====================================================
   PROFILE
===================================================== */

app.put("/api/profile", auth, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    const experience =
      String(req.body.experience || "Fresher").trim();

    const role =
      String(req.body.role || "").trim();

    const location =
      String(req.body.location || "").trim();

    const skills =
      String(req.body.skills || "").trim();

    if (name) {
      await q(
        "UPDATE users SET name=$1 WHERE id=$2",
        [name, req.user.id]
      );
    }

    await q(
      `
      INSERT INTO profiles
      (user_id,experience,role,location,skills,updated_at)
      VALUES($1,$2,$3,$4,$5,NOW())
      ON CONFLICT(user_id)
      DO UPDATE SET
        experience=EXCLUDED.experience,
        role=EXCLUDED.role,
        location=EXCLUDED.location,
        skills=EXCLUDED.skills,
        updated_at=NOW()
      `,
      [
        req.user.id,
        experience,
        role,
        location,
        skills,
      ]
    );

    res.json({
      ok: true,
      message: "Profile updated successfully!",
    });

  } catch (e) {
    console.error("PROFILE ERROR:", e);

    res.status(500).json({
      error: "Could not update profile.",
    });
  }
});

/* =====================================================
   JOBS
===================================================== */

app.get("/api/jobs", async (req, res) => {
  try {
    const search = String(req.query.q || "")
      .trim()
      .toLowerCase();

    const level = String(req.query.level || "").trim();
    const location = String(req.query.location || "")
      .trim()
      .toLowerCase();

    const type = String(req.query.type || "").trim();

    const result = await q(`
      SELECT *
      FROM jobs
      WHERE status IS NULL
         OR status='approved'
      ORDER BY created_at DESC, id DESC
    `);

    let data = result.rows.map(j => {
      let skills = [];

      try {
        skills =
          typeof j.skills === "string"
            ? JSON.parse(j.skills)
            : j.skills || [];
      } catch {
        skills = String(j.skills || "")
          .split(",")
          .map(x => x.trim())
          .filter(Boolean);
      }

      return {
        id: j.id,
        title: j.title,
        company: j.company,
        location: j.location,
        level: j.level,
        type: j.type,
        salary: j.salary,
        skills,
        description: j.description,
      };
    });

    if (search) {
      data = data.filter(j =>
        JSON.stringify(j)
          .toLowerCase()
          .includes(search)
      );
    }

    if (level) {
      data = data.filter(j =>
        j.level === level
      );
    }

    if (location) {
      data = data.filter(j =>
        String(j.location || "")
          .toLowerCase()
          .includes(location)
      );
    }

    if (type) {
      data = data.filter(j =>
        j.type === type
      );
    }

    res.json(data);

  } catch (e) {
    console.error("JOBS ERROR:", e);

    res.status(500).json({
      error: "Could not load jobs.",
    });
  }
});

/* =====================================================
   SAVED JOBS
===================================================== */

app.get("/api/saved", auth, async (req, res) => {
  try {
    const result = await q(
      `
      SELECT job_id
      FROM saved
      WHERE user_id=$1
      ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    res.json(
      result.rows.map(x => Number(x.job_id))
    );

  } catch (e) {
    res.status(500).json({
      error: "Could not load saved jobs.",
    });
  }
});

app.post("/api/saved/:id", auth, async (req, res) => {
  try {
    const jobId = Number(req.params.id);

    const existing = await q(
      `
      SELECT 1
      FROM saved
      WHERE user_id=$1 AND job_id=$2
      `,
      [
        req.user.id,
        jobId,
      ]
    );

    if (existing.rowCount) {
      await q(
        `
        DELETE FROM saved
        WHERE user_id=$1 AND job_id=$2
        `,
        [
          req.user.id,
          jobId,
        ]
      );

      return res.json({
        saved: false,
        message: "Job removed from saved jobs.",
      });
    }

    await q(
      `
      INSERT INTO saved(user_id,job_id)
      VALUES($1,$2)
      ON CONFLICT(user_id,job_id) DO NOTHING
      `,
      [
        req.user.id,
        jobId,
      ]
    );

    res.json({
      saved: true,
      message: "Job saved successfully!",
    });

  } catch (e) {
    console.error("SAVE ERROR:", e);

    res.status(500).json({
      error: "Could not save this job.",
    });
  }
});

/* =====================================================
   APPLICATIONS
===================================================== */

app.get("/api/applications", auth, async (req, res) => {
  try {
    const result = await q(
      `
      SELECT
        a.id,
        a.job_id,
        a.status,
        a.recruiter_note,
        a.created_at,
        j.title,
        j.company,
        j.location,
        j.type,
        j.salary
      FROM applications a
      LEFT JOIN jobs j
        ON j.id=a.job_id
      WHERE a.user_id=$1
      ORDER BY a.created_at DESC
      `,
      [req.user.id]
    );

    res.json(
      result.rows.map(a => ({
        id: a.id,
        job_id: a.job_id,
        status: a.status,
        recruiter_note: a.recruiter_note,
        created_at: a.created_at,

        job: {
          id: a.job_id,
          title: a.title,
          company: a.company,
          location: a.location,
          type: a.type,
          salary: a.salary,
        },
      }))
    );

  } catch (e) {
    console.error("APPLICATION LOAD ERROR:", e);

    res.status(500).json({
      error: "Could not load applications.",
    });
  }
});

/* APPLY */

app.post("/api/applications/:id", auth, async (req, res) => {
  try {
    const jobId = Number(req.params.id);

    const job = await q(
      "SELECT id,title,company FROM jobs WHERE id=$1",
      [jobId]
    );

    if (!job.rowCount) {
      return res.status(404).json({
        error: "Job not found.",
      });
    }

    const result = await q(
      `
      INSERT INTO applications
      (user_id,job_id,status)
      VALUES($1,$2,'Applied')
      ON CONFLICT(user_id,job_id)
      DO UPDATE SET status='Applied'
      RETURNING *
      `,
      [
        req.user.id,
        jobId,
      ]
    );

    res.json({
      ok: true,
      application: result.rows[0],
      message:
        "Application submitted successfully!",
    });

  } catch (e) {
    console.error("APPLY ERROR:", e);

    res.status(500).json({
      error: "Could not submit application.",
    });
  }
});

/* UPDATE APPLICATION STATUS */

app.patch("/api/applications/:id", auth, async (req, res) => {
  try {
    const allowed = [
      "Applied",
      "Assessment",
      "Interview",
      "Offer",
      "Rejected",
      "Withdrawn",
    ];

    const status = String(
      req.body.status || ""
    );

    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: "Invalid application status.",
      });
    }

    const result = await q(
      `
      UPDATE applications
      SET status=$1
      WHERE id=$2 AND user_id=$3
      RETURNING *
      `,
      [
        status,
        Number(req.params.id),
        req.user.id,
      ]
    );

    res.json({
      ok: true,
      application: result.rows[0],
      message: "Application status updated.",
    });

  } catch (e) {
    res.status(500).json({
      error: "Could not update application.",
    });
  }
});

/* DELETE APPLICATION */

app.delete("/api/applications/:id", auth, async (req, res) => {
  try {
    await q(
      `
      DELETE FROM applications
      WHERE id=$1 AND user_id=$2
      `,
      [
        Number(req.params.id),
        req.user.id,
      ]
    );

    res.json({
      ok: true,
      message: "Application removed.",
    });

  } catch (e) {
    res.status(500).json({
      error: "Could not remove application.",
    });
  }
});

/* =====================================================
   RESUME ANALYZER
===================================================== */

app.post(
  "/api/resume",
  auth,
  upload.single("resume"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "Please choose a resume file first.",
        });
      }

      const extension =
        path
          .extname(req.file.originalname)
          .toLowerCase();

      let text = "";

      if (
        extension === ".txt" ||
        extension === ".md"
      ) {
        text =
          req.file.buffer.toString();
      }

      const checks = [
        [
          "Contact details",
          /email|@|phone/i.test(text),
        ],
        [
          "Skills",
          /skills/i.test(text),
        ],
        [
          "Education",
          /education|degree|college|university/i.test(text),
        ],
        [
          "Projects / Experience",
          /project|experience|internship/i.test(text),
        ],
        [
          "Action verbs",
          /built|created|developed|implemented|designed/i.test(text),
        ],
      ];

      const score = Math.min(
        100,
        40 +
          checks.filter(x => x[1]).length * 12
      );

      const suggestions = checks
        .filter(x => !x[1])
        .map(x => "Review " + x[0]);

      const analysis = {
        score,
        checks,
        suggestions,
      };

      await q(
        `
        INSERT INTO resumes
        (user_id,filename,analysis)
        VALUES($1,$2,$3)
        `,
        [
          req.user.id,
          req.file.originalname,
          JSON.stringify(analysis),
        ]
      );

      res.json({
        ok: true,
        analysis,
        message:
          "Resume uploaded and analyzed successfully!",
      });

    } catch (e) {
      console.error("RESUME ERROR:", e);

      res.status(500).json({
        error: "Resume analysis failed.",
      });
    }
  }
);

/* =====================================================
   MOCK INTERVIEW
===================================================== */

app.post("/api/interview", auth, async (req, res) => {
  try {
    const answers = Array.isArray(req.body.answers)
      ? req.body.answers
          .map(x => String(x || "").trim())
          .filter(Boolean)
      : [];

    const role =
      String(req.body.role || "").trim();

    const words = answers
      .join(" ")
      .split(/\s+/)
      .filter(Boolean)
      .length;

    const score = Math.min(
      100,
      Math.round(
        (answers.length / 5) * 55 +
        (Math.min(words, 200) / 200) * 45
      )
    );

    await q(
      `
      INSERT INTO interviews
      (user_id,role,score,answers)
      VALUES($1,$2,$3,$4)
      `,
      [
        req.user.id,
        role,
        score,
        JSON.stringify(answers),
      ]
    );

    res.json({
      ok: true,
      score,
      answered: answers.length,
      feedback:
        "Use specific examples, clear structure and measurable outcomes. For behavioral questions, use Situation → Task → Action → Result.",
      message:
        "Mock interview completed successfully!",
    });

  } catch (e) {
    console.error("INTERVIEW ERROR:", e);

    res.status(500).json({
      error: "Mock interview failed.",
    });
  }
});

/* =====================================================
   RECRUITER - POST JOB
===================================================== */

app.post("/api/recruiter/jobs", auth, async (req, res) => {
  try {
    if (req.user.role !== "recruiter") {
      return res.status(403).json({
        error: "Recruiter account required.",
      });
    }

    const {
      title,
      company,
      location,
      level,
      type,
      salary,
      skills,
      description,
    } = req.body;

    if (!title || !company) {
      return res.status(400).json({
        error: "Job title and company are required.",
      });
    }

    const skillText = Array.isArray(skills)
      ? JSON.stringify(skills)
      : JSON.stringify(
          String(skills || "")
            .split(",")
            .map(x => x.trim())
            .filter(Boolean)
        );

    const result = await q(
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
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved')
      RETURNING *
      `,
      [
        req.user.id,
        title,
        company,
        location || "",
        level || "Fresher",
        type || "Full-time",
        salary || "",
        skillText,
        description || "",
      ]
    );

    res.json({
      ok: true,
      job: result.rows[0],
      message: "Job posted successfully!",
    });

  } catch (e) {
    console.error("POST JOB ERROR:", e);

    res.status(500).json({
      error: "Could not post job.",
    });
  }
});

/* =====================================================
   RECRUITER JOBS
===================================================== */

app.get("/api/recruiter/jobs", auth, async (req, res) => {
  try {
    if (req.user.role !== "recruiter") {
      return res.status(403).json({
        error: "Recruiter account required.",
      });
    }

    const result = await q(
      `
      SELECT *
      FROM jobs
      WHERE recruiter_id=$1
      ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    res.json(result.rows);

  } catch (e) {
    res.status(500).json({
      error: "Could not load recruiter jobs.",
    });
  }
});

/* =====================================================
   RECRUITER APPLICATIONS
===================================================== */

app.get(
  "/api/recruiter/applications",
  auth,
  async (req, res) => {
    try {
      if (req.user.role !== "recruiter") {
        return res.status(403).json({
          error: "Recruiter account required.",
        });
      }

      const result = await q(
        `
        SELECT
          a.id,
          a.status,
          a.recruiter_note,
          a.created_at,
          u.name,
          u.email,
          j.title,
          j.company
        FROM applications a
        JOIN users u
          ON u.id=a.user_id
        JOIN jobs j
          ON j.id=a.job_id
        WHERE j.recruiter_id=$1
        ORDER BY a.created_at DESC
        `,
        [req.user.id]
      );

      res.json(result.rows);

    } catch (e) {
      res.status(500).json({
        error:
          "Could not load applicants.",
      });
    }
  }
);

/* =====================================================
   RECRUITER UPDATE APPLICATION
===================================================== */

app.patch(
  "/api/recruiter/applications/:id",
  auth,
  async (req, res) => {
    try {
      if (req.user.role !== "recruiter") {
        return res.status(403).json({
          error: "Recruiter account required.",
        });
      }

      const allowed = [
        "Applied",
        "Assessment",
        "Interview",
        "Offer",
        "Rejected",
      ];

      const status =
        String(req.body.status || "");

      if (!allowed.includes(status)) {
        return res.status(400).json({
          error: "Invalid status.",
        });
      }

      const result = await q(
        `
        UPDATE applications a
        SET
          status=$1,
          recruiter_note=$2
        FROM jobs j
        WHERE
          a.id=$3
          AND a.job_id=j.id
          AND j.recruiter_id=$4
        RETURNING a.*
        `,
        [
          status,
          String(req.body.note || ""),
          Number(req.params.id),
          req.user.id,
        ]
      );

      res.json({
        ok: true,
        application: result.rows[0],
        message:
          "Applicant status updated!",
      });

    } catch (e) {
      res.status(500).json({
        error:
          "Could not update applicant.",
      });
    }
  }
);

/* =====================================================
   FRONTEND
===================================================== */

/*
   Express 4 compatible catch-all.
   package.json currently uses Express 4.
*/

app.get("*", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

/* =====================================================
   START
===================================================== */

init()
  .then(() => {
    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          "CareerNexa listening on " + PORT
        );
      }
    );
  })
  .catch(error => {
    console.error(
      "SERVER START ERROR:",
      error
    );

    process.exit(1);
  });
