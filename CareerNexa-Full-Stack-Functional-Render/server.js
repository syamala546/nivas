const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Pool } = require("pg");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false
    })
  : null;

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024
  }
});

async function q(sql, params = []) {
  if (!pool) {
    throw new Error("DATABASE_URL is missing.");
  }

  return pool.query(sql, params);
}

/* =========================================================
   SEED JOBS
========================================================= */

const seedJobs = [
  {
    title: "Frontend Developer Intern",
    company: "PixelSpring",
    location: "Hyderabad / Remote",
    level: "Fresher",
    type: "Internship",
    salary: "₹15k–₹25k/month",
    skills: ["HTML", "CSS", "JavaScript", "React"],
    description: "Build responsive interfaces with mentorship."
  },

  {
    title: "Graduate Software Engineer",
    company: "Northstar Labs",
    location: "Bengaluru",
    level: "Fresher",
    type: "Full-time",
    salary: "₹4–7 LPA",
    skills: ["Java", "SQL", "Git"],
    description: "Graduate engineering role with structured training."
  },

  {
    title: "Junior React Developer",
    company: "CloudMint",
    location: "Remote",
    level: "0–1 years",
    type: "Full-time",
    salary: "₹5–8 LPA",
    skills: ["React", "JavaScript", "TypeScript"],
    description: "Build modern frontend experiences."
  },

  {
    title: "Data Analyst Trainee",
    company: "MetricLeaf",
    location: "Chennai",
    level: "Fresher",
    type: "Trainee",
    salary: "₹3–5 LPA",
    skills: ["SQL", "Excel", "Python"],
    description: "Reporting, dashboards and data-quality projects."
  },

  {
    title: "Backend Developer",
    company: "StackHarbor",
    location: "Pune",
    level: "2+ years",
    type: "Full-time",
    salary: "₹10–16 LPA",
    skills: ["Node.js", "PostgreSQL", "APIs"],
    description: "Develop reliable backend services."
  },

  {
    title: "QA Engineer Intern",
    company: "BrightTest",
    location: "Remote",
    level: "Fresher",
    type: "Internship",
    salary: "₹12k–₹20k/month",
    skills: ["Testing", "SQL", "JavaScript"],
    description: "Learn testing, bug reporting and automation."
  },

  {
    title: "Python Developer",
    company: "CodeOrbit",
    location: "Hyderabad",
    level: "0–2 years",
    type: "Full-time",
    salary: "₹5–9 LPA",
    skills: ["Python", "Django", "PostgreSQL"],
    description: "Develop APIs and business applications."
  },

  {
    title: "Full Stack Developer",
    company: "NovaStack",
    location: "Bengaluru / Hybrid",
    level: "1–3 years",
    type: "Full-time",
    salary: "₹8–14 LPA",
    skills: ["React", "Node.js", "PostgreSQL"],
    description: "Own features from UI to API."
  },

  {
    title: "AI/ML Intern",
    company: "AIVerse Labs",
    location: "Remote",
    level: "Fresher",
    type: "Internship",
    salary: "₹18k–₹30k/month",
    skills: ["Python", "Machine Learning", "Pandas"],
    description: "Work on data and machine-learning experiments."
  },

  {
    title: "UI/UX Designer",
    company: "DesignMint",
    location: "Pune / Remote",
    level: "0–2 years",
    type: "Full-time",
    salary: "₹4–8 LPA",
    skills: ["Figma", "UI", "UX", "Prototyping"],
    description: "Design intuitive digital products."
  },

  {
    title: "DevOps Engineer",
    company: "CloudForge",
    location: "Chennai",
    level: "2–5 years",
    type: "Full-time",
    salary: "₹12–20 LPA",
    skills: ["AWS", "Docker", "CI/CD"],
    description: "Automate deployment and cloud infrastructure."
  },

  {
    title: "Cyber Security Analyst",
    company: "SecureGrid",
    location: "Delhi NCR",
    level: "1–3 years",
    type: "Full-time",
    salary: "₹7–13 LPA",
    skills: ["Security", "Linux", "Networking"],
    description: "Monitor systems and investigate security events."
  },

  {
    title: "Business Analyst",
    company: "GrowthWorks",
    location: "Mumbai",
    level: "0–2 years",
    type: "Full-time",
    salary: "₹5–10 LPA",
    skills: ["Excel", "SQL", "Communication"],
    description: "Translate business needs into requirements."
  },

  {
    title: "HR Executive",
    company: "PeopleFirst",
    location: "Hyderabad",
    level: "0–2 years",
    type: "Full-time",
    salary: "₹3–6 LPA",
    skills: ["Recruitment", "Communication", "Excel"],
    description: "Support hiring and employee operations."
  },

  {
    title: "Digital Marketing Executive",
    company: "BrandNest",
    location: "Remote",
    level: "Fresher",
    type: "Full-time",
    salary: "₹3–6 LPA",
    skills: ["SEO", "Social Media", "Analytics"],
    description: "Create campaigns and measure growth."
  }
];

/* =========================================================
   DATABASE HELPERS
========================================================= */

async function ensureColumn(table, column, definition) {
  await q(
    `ALTER TABLE ${table}
     ADD COLUMN IF NOT EXISTS ${column} ${definition}`
  );
}

/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

async function init() {
  await q(`
    CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'candidate',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ensureColumn(
    "users",
    "role",
    "TEXT DEFAULT 'candidate'"
  );

  await ensureColumn(
    "users",
    "created_at",
    "TIMESTAMPTZ DEFAULT NOW()"
  );

  await q(`
    CREATE TABLE IF NOT EXISTS profiles(
      user_id INT PRIMARY KEY
        REFERENCES users(id)
        ON DELETE CASCADE,

      experience TEXT DEFAULT 'Fresher',
      role TEXT DEFAULT '',
      location TEXT DEFAULT '',
      skills TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      education TEXT DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ensureColumn(
    "profiles",
    "experience",
    "TEXT DEFAULT 'Fresher'"
  );

  await ensureColumn(
    "profiles",
    "role",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "profiles",
    "location",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "profiles",
    "skills",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "profiles",
    "bio",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "profiles",
    "education",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "profiles",
    "updated_at",
    "TIMESTAMPTZ DEFAULT NOW()"
  );

  /* JOBS */

  await q(`
    CREATE TABLE IF NOT EXISTS jobs(
      id SERIAL PRIMARY KEY,

      recruiter_id INT
        REFERENCES users(id)
        ON DELETE SET NULL,

      title TEXT NOT NULL,
      company TEXT NOT NULL,

      location TEXT DEFAULT 'Remote',
      level TEXT DEFAULT 'Fresher',
      type TEXT DEFAULT 'Full-time',
      salary TEXT DEFAULT 'Not disclosed',

      skills TEXT DEFAULT '',
      description TEXT DEFAULT '',

      status TEXT DEFAULT 'approved',

      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await ensureColumn(
    "jobs",
    "recruiter_id",
    "INT REFERENCES users(id) ON DELETE SET NULL"
  );

  await ensureColumn(
    "jobs",
    "location",
    "TEXT DEFAULT 'Remote'"
  );

  await ensureColumn(
    "jobs",
    "level",
    "TEXT DEFAULT 'Fresher'"
  );

  await ensureColumn(
    "jobs",
    "type",
    "TEXT DEFAULT 'Full-time'"
  );

  await ensureColumn(
    "jobs",
    "salary",
    "TEXT DEFAULT 'Not disclosed'"
  );

  await ensureColumn(
    "jobs",
    "skills",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "jobs",
    "description",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "jobs",
    "status",
    "TEXT DEFAULT 'approved'"
  );

  await ensureColumn(
    "jobs",
    "created_at",
    "TIMESTAMPTZ DEFAULT NOW()"
  );

  /* SAVED */

  await q(`
    CREATE TABLE IF NOT EXISTS saved(
      user_id INT
        REFERENCES users(id)
        ON DELETE CASCADE,

      job_id INT
        REFERENCES jobs(id)
        ON DELETE CASCADE,

      created_at TIMESTAMPTZ DEFAULT NOW(),

      PRIMARY KEY(user_id, job_id)
    )
  `);

  /* APPLICATIONS */

  await q(`
    CREATE TABLE IF NOT EXISTS applications(
      id SERIAL PRIMARY KEY,

      user_id INT
        REFERENCES users(id)
        ON DELETE CASCADE,

      job_id INT
        REFERENCES jobs(id)
        ON DELETE CASCADE,

      status TEXT DEFAULT 'Applied',

      recruiter_note TEXT DEFAULT '',

      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(user_id, job_id)
    )
  `);

  await ensureColumn(
    "applications",
    "recruiter_note",
    "TEXT DEFAULT ''"
  );

  await ensureColumn(
    "applications",
    "updated_at",
    "TIMESTAMPTZ DEFAULT NOW()"
  );

  /* RESUMES */

  await q(`
    CREATE TABLE IF NOT EXISTS resumes(
      id SERIAL PRIMARY KEY,

      user_id INT
        REFERENCES users(id)
        ON DELETE CASCADE,

      filename TEXT,

      analysis JSONB,

      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  /* INTERVIEWS */

  await q(`
    CREATE TABLE IF NOT EXISTS interviews(
      id SERIAL PRIMARY KEY,

      user_id INT
        REFERENCES users(id)
        ON DELETE CASCADE,

      role TEXT,

      score INT,

      answers JSONB,

      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  /* =====================================================
     SEED JOBS WITHOUT DELETING EXISTING JOBS
  ===================================================== */

  for (const job of seedJobs) {
    const exists = await q(
      `
      SELECT id
      FROM jobs
      WHERE LOWER(title) = LOWER($1)
      LIMIT 1
      `,
      [job.title]
    );

    if (!exists.rowCount) {
      await q(
        `
        INSERT INTO jobs(
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
        VALUES(
          $1,$2,$3,$4,$5,$6,$7,$8,'approved'
        )
        `,
        [
          job.title,
          job.company,
          job.location,
          job.level,
          job.type,
          job.salary,
          job.skills.join(", "),
          job.description
        ]
      );
    }
  }

  await q(`
    UPDATE users
    SET role = 'candidate'
    WHERE role IS NULL OR role = ''
  `);

  console.log("CareerNexa database ready.");
}

/* =========================================================
   AUTH
========================================================= */

function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "");

    req.user = jwt.verify(token, SECRET);

    next();
  } catch {
    return res.status(401).json({
      error: "Please log in again."
    });
  }
}

function recruiterOnly(req, res, next) {
  if (!["recruiter", "admin"].includes(req.user.role)) {
    return res.status(403).json({
      error: "Recruiter access required."
    });
  }

  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: "Admin access required."
    });
  }

  next();
}

/* =========================================================
   JOB FORMATTER
========================================================= */

function jobOut(job) {
  return {
    ...job,

    skills: String(job.skills || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
  };
}

/* =========================================================
   HEALTH
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    database: !!pool,
    app: "CareerNexa"
  });
});

/* =========================================================
   REGISTER
========================================================= */

app.post("/api/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    const role = ["candidate", "recruiter"].includes(
      req.body.role
    )
      ? req.body.role
      : "candidate";

    if (!name || !email || password.length < 8) {
      return res.status(400).json({
        error:
          "Name, email and password (8+ characters) are required."
      });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = await q(
      `
      INSERT INTO users(
        name,
        email,
        password_hash,
        role
      )
      VALUES($1,$2,$3,$4)
      RETURNING id,name,email,role
      `,
      [name, email, hash, role]
    );

    const user = result.rows[0];

    await q(
      `
      INSERT INTO profiles(user_id)
      VALUES($1)
      ON CONFLICT DO NOTHING
      `,
      [user.id]
    );

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role
      },
      SECRET,
      {
        expiresIn: "7d"
      }
    );

    res.json({
      token,
      user
    });
  } catch (error) {
    console.error(error);

    if (error.code === "23505") {
      return res.status(409).json({
        error: "Email already registered."
      });
    }

    res.status(500).json({
      error: "Registration failed."
    });
  }
});

/* =========================================================
   LOGIN
========================================================= */

app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    const result = await q(
      `
      SELECT *
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    const user = result.rows[0];

    if (
      !user ||
      !(await bcrypt.compare(
        password,
        user.password_hash
      ))
    ) {
      return res.status(401).json({
        error: "Email or password is incorrect."
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role || "candidate"
      },
      SECRET,
      {
        expiresIn: "7d"
      }
    );

    res.json({
      token,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || "candidate"
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Login failed."
    });
  }
});

/* =========================================================
   CURRENT USER
========================================================= */

app.get("/api/me", auth, async (req, res) => {
  const result = await q(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,

      p.experience,
      p.role AS preferred_role,
      p.location,
      p.skills,
      p.bio,
      p.education

    FROM users u

    LEFT JOIN profiles p
      ON p.user_id = u.id

    WHERE u.id = $1
    `,
    [req.user.id]
  );

  res.json(result.rows[0] || {});
});

/* =========================================================
   PROFILE
========================================================= */

app.put("/api/profile", auth, async (req, res) => {
  const body = req.body || {};

  const name =
    String(body.name || "").trim() || "User";

  await q(
    `
    UPDATE users
    SET name = $1
    WHERE id = $2
    `,
    [name, req.user.id]
  );

  const result = await q(
    `
    INSERT INTO profiles(
      user_id,
      experience,
      role,
      location,
      skills,
      bio,
      education,
      updated_at
    )

    VALUES(
      $1,$2,$3,$4,$5,$6,$7,NOW()
    )

    ON CONFLICT(user_id)
    DO UPDATE SET
      experience = EXCLUDED.experience,
      role = EXCLUDED.role,
      location = EXCLUDED.location,
      skills = EXCLUDED.skills,
      bio = EXCLUDED.bio,
      education = EXCLUDED.education,
      updated_at = NOW()

    RETURNING *
    `,
    [
      req.user.id,
      body.experience || "Fresher",
      body.role || "",
      body.location || "",
      body.skills || "",
      body.bio || "",
      body.education || ""
    ]
  );

  res.json(result.rows[0]);
});

/* =========================================================
   JOBS
========================================================= */

app.get("/api/jobs", async (req, res) => {
  try {
    const {
      q: search = "",
      level = "",
      location = "",
      type = "",
      skill = ""
    } = req.query;

    const result = await q(
      `
      SELECT *
      FROM jobs
      WHERE status = 'approved'
      ORDER BY created_at DESC
      `
    );

    const searchText = String(search).toLowerCase();
    const skillText = String(skill).toLowerCase();
    const locationText = String(location).toLowerCase();

    const filtered = result.rows
      .filter(job => {
        const whole = JSON.stringify(job).toLowerCase();

        return (
          (!searchText ||
            whole.includes(searchText)) &&

          (!level ||
            job.level === level) &&

          (!locationText ||
            String(job.location)
              .toLowerCase()
              .includes(locationText)) &&

          (!type ||
            job.type === type) &&

          (!skillText ||
            String(job.skills)
              .toLowerCase()
              .includes(skillText))
        );
      })
      .map(jobOut);

    res.json(filtered);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to load jobs."
    });
  }
});

/* =========================================================
   SINGLE JOB
========================================================= */

app.get("/api/jobs/:id", async (req, res) => {
  const result = await q(
    `
    SELECT *
    FROM jobs
    WHERE id = $1
    `,
    [+req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      error: "Job not found."
    });
  }

  res.json(jobOut(result.rows[0]));
});

/* =========================================================
   SAVED JOBS
========================================================= */

app.get("/api/saved", auth, async (req, res) => {
  const result = await q(
    `
    SELECT job_id
    FROM saved
    WHERE user_id = $1
    `,
    [req.user.id]
  );

  res.json(
    result.rows.map(row => row.job_id)
  );
});

app.post("/api/saved/:id", auth, async (req, res) => {
  const jobId = Number(req.params.id);

  const found = await q(
    `
    SELECT 1
    FROM saved
    WHERE user_id = $1
      AND job_id = $2
    `,
    [req.user.id, jobId]
  );

  if (found.rowCount) {
    await q(
      `
      DELETE FROM saved
      WHERE user_id = $1
        AND job_id = $2
      `,
      [req.user.id, jobId]
    );

    return res.json({
      saved: false,
      message: "Removed from saved jobs."
    });
  }

  await q(
    `
    INSERT INTO saved(user_id,job_id)
    VALUES($1,$2)
    ON CONFLICT DO NOTHING
    `,
    [req.user.id, jobId]
  );

  res.json({
    saved: true,
    message: "Job saved."
  });
});

/* =========================================================
   APPLICATIONS
========================================================= */

app.get("/api/applications", auth, async (req, res) => {
  const result = await q(
    `
    SELECT
      a.*,

      j.title,
      j.company,
      j.location,
      j.level,
      j.type,
      j.salary,
      j.skills,
      j.description

    FROM applications a

    JOIN jobs j
      ON j.id = a.job_id

    WHERE a.user_id = $1

    ORDER BY a.created_at DESC
    `,
    [req.user.id]
  );

  const data = result.rows.map(row => ({
    ...row,

    job: jobOut({
      id: row.job_id,
      title: row.title,
      company: row.company,
      location: row.location,
      level: row.level,
      type: row.type,
      salary: row.salary,
      skills: row.skills,
      description: row.description
    })
  }));

  res.json(data);
});

/* APPLY */

app.post("/api/applications/:id", auth, async (req, res) => {
  const job = await q(
    `
    SELECT id
    FROM jobs
    WHERE id = $1
      AND status = 'approved'
    `,
    [+req.params.id]
  );

  if (!job.rowCount) {
    return res.status(404).json({
      error: "Job is not available."
    });
  }

  const result = await q(
    `
    INSERT INTO applications(
      user_id,
      job_id,
      status
    )
    VALUES(
      $1,
      $2,
      'Applied'
    )

    ON CONFLICT(user_id,job_id)
    DO UPDATE SET
      updated_at = NOW()

    RETURNING *
    `,
    [
      req.user.id,
      +req.params.id
    ]
  );

  res.json({
    ok: true,
    message: "Application submitted successfully.",
    application: result.rows[0]
  });
});

/* UPDATE APPLICATION STATUS */

app.patch("/api/applications/:id", auth, async (req, res) => {
  const allowed = [
    "Applied",
    "Received",
    "Shortlisted",
    "Assessment",
    "Interview",
    "Offer",
    "Selected",
    "Rejected",
    "Withdrawn"
  ];

  const status = req.body.status;

  if (!allowed.includes(status)) {
    return res.status(400).json({
      error: "Invalid application status."
    });
  }

  let result;

  if (
    req.user.role === "recruiter" ||
    req.user.role === "admin"
  ) {
    result = await q(
      `
      UPDATE applications a

      SET
        status = $1,
        recruiter_note = $4,
        updated_at = NOW()

      FROM jobs j

      WHERE
        a.id = $2
        AND a.job_id = j.id
        AND (
          j.recruiter_id = $3
          OR $5 = 'admin'
        )

      RETURNING a.*
      `,
      [
        status,
        +req.params.id,
        req.user.id,
        req.body.note || "",
        req.user.role
      ]
    );
  } else {
    result = await q(
      `
      UPDATE applications

      SET
        status = $1,
        updated_at = NOW()

      WHERE
        id = $2
        AND user_id = $3

      RETURNING *
      `,
      [
        status,
        +req.params.id,
        req.user.id
      ]
    );
  }

  if (!result.rowCount) {
    return res.status(404).json({
      error: "Application not found."
    });
  }

  res.json(result.rows[0]);
});

/* DELETE APPLICATION */

app.delete("/api/applications/:id", auth, async (req, res) => {
  await q(
    `
    DELETE FROM applications

    WHERE id = $1
      AND user_id = $2
    `,
    [
      +req.params.id,
      req.user.id
    ]
  );

  res.json({
    ok: true
  });
});

/* =========================================================
   RESUME ANALYZER
========================================================= */

app.post(
  "/api/resume",
  auth,
  upload.single("resume"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "Choose a resume file first."
      });
    }

    const extension = path
      .extname(req.file.originalname)
      .toLowerCase();

    let text = "";

    if (
      [".txt", ".md", ".csv"].includes(extension)
    ) {
      text = req.file.buffer.toString("utf8");
    }

    const checks = [
      [
        "Contact details",
        /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|phone|mobile/i.test(
          text
        )
      ],

      [
        "Skills section",
        /\bskills?\b/i.test(text)
      ],

      [
        "Education",
        /education|degree|college|university|b\.?tech|m\.?tech/i.test(
          text
        )
      ],

      [
        "Projects / experience",
        /project|experience|internship|employment/i.test(
          text
        )
      ],

      [
        "Action verbs",
        /built|created|developed|implemented|designed|improved|managed|automated/i.test(
          text
        )
      ]
    ];

    const score = Math.min(
      100,
      40 + checks.filter(x => x[1]).length * 12
    );

    const suggestions = checks
      .filter(x => !x[1])
      .map(x => "Add or improve: " + x[0]);

    const analysis = {
      score,
      checks,
      suggestions
    };

    await q(
      `
      INSERT INTO resumes(
        user_id,
        filename,
        analysis
      )
      VALUES(
        $1,
        $2,
        $3
      )
      `,
      [
        req.user.id,
        req.file.originalname,
        JSON.stringify(analysis)
      ]
    );

    res.json({
      analysis,

      note: text
        ? "Text-based resume checks completed."
        : "File received. Basic PDF/DOCX text extraction is not enabled in this lightweight analyzer."
    });
  }
);

/* =========================================================
   MOCK INTERVIEW
========================================================= */

app.post("/api/interview", auth, async (req, res) => {
  const answers = (req.body.answers || [])
    .map(String)
    .filter(x => x.trim());

  const words = answers
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

  const score = Math.min(
    100,
    Math.round(
      answers.length * 10 +
      Math.min(words, 200) * 0.25
    )
  );

  let feedback;

  if (score >= 75) {
    feedback =
      "Strong attempt. Add measurable results and concrete examples.";
  } else if (score >= 50) {
    feedback =
      "Good start. Structure answers using Situation → Task → Action → Result.";
  } else {
    feedback =
      "Practice concise examples, role-specific skills and measurable outcomes.";
  }

  await q(
    `
    INSERT INTO interviews(
      user_id,
      role,
      score,
      answers
    )
    VALUES(
      $1,$2,$3,$4
    )
    `,
    [
      req.user.id,
      req.body.role || "",
      score,
      JSON.stringify(answers)
    ]
  );

  res.json({
    score,
    answered: answers.length,
    feedback
  });
});

/* =========================================================
   RECRUITER — POST JOB
========================================================= */

app.post(
  "/api/recruiter/jobs",
  auth,
  recruiterOnly,
  async (req, res) => {
    const body = req.body || {};

    if (!body.title || !body.company) {
      return res.status(400).json({
        error: "Job title and company are required."
      });
    }

    const skills = Array.isArray(body.skills)
      ? body.skills.join(", ")
      : String(body.skills || "");

    const result = await q(
      `
      INSERT INTO jobs(
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

      VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,'approved'
      )

      RETURNING *
      `,
      [
        req.user.id,
        body.title,
        body.company,
        body.location || "Remote",
        body.level || "Fresher",
        body.type || "Full-time",
        body.salary || "Not disclosed",
        skills,
        body.description || ""
      ]
    );

    res.json({
      message: "Job posted successfully.",
      job: jobOut(result.rows[0])
    });
  }
);

/* =========================================================
   RECRUITER — MY JOBS
========================================================= */

app.get(
  "/api/recruiter/jobs",
  auth,
  recruiterOnly,
  async (req, res) => {
    const result = await q(
      `
      SELECT *
      FROM jobs
      WHERE recruiter_id = $1
      ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    res.json(result.rows.map(jobOut));
  }
);

/* DELETE RECRUITER JOB */

app.delete(
  "/api/recruiter/jobs/:id",
  auth,
  recruiterOnly,
  async (req, res) => {
    const result = await q(
      `
      DELETE FROM jobs
      WHERE id = $1
        AND recruiter_id = $2
      RETURNING id
      `,
      [
        +req.params.id,
        req.user.id
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Job not found."
      });
    }

    res.json({
      ok: true
    });
  }
);

/* =========================================================
   RECRUITER — APPLICANTS
========================================================= */

app.get(
  "/api/recruiter/applications",
  auth,
  recruiterOnly,
  async (req, res) => {
    const result = await q(
      `
      SELECT
        a.*,

        j.title AS job_title,
        j.company,

        u.id AS candidate_id,
        u.name AS candidate_name,
        u.email AS candidate_email,

        p.experience,
        p.role AS preferred_role,
        p.location,
        p.skills,
        p.education

      FROM applications a

      JOIN jobs j
        ON j.id = a.job_id

      JOIN users u
        ON u.id = a.user_id

      LEFT JOIN profiles p
        ON p.user_id = u.id

      WHERE j.recruiter_id = $1

      ORDER BY a.created_at DESC
      `,
      [req.user.id]
    );

    res.json(result.rows);
  }
);

/* =========================================================
   ADMIN
========================================================= */

app.get(
  "/api/admin/users",
  auth,
  adminOnly,
  async (req, res) => {
    const result = await q(
      `
      SELECT
        id,
        name,
        email,
        role,
        created_at

      FROM users

      ORDER BY created_at DESC
      `
    );

    res.json(result.rows);
  }
);

app.get(
  "/api/admin/jobs",
  auth,
  adminOnly,
  async (req, res) => {
    const result = await q(
      `
      SELECT *
      FROM jobs
      ORDER BY created_at DESC
      `
    );

    res.json(result.rows.map(jobOut));
  }
);

app.patch(
  "/api/admin/jobs/:id",
  auth,
  adminOnly,
  async (req, res) => {
    const allowed = [
      "approved",
      "pending",
      "rejected"
    ];

    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({
        error: "Invalid job status."
      });
    }

    const result = await q(
      `
      UPDATE jobs
      SET status = $1
      WHERE id = $2
      RETURNING *
      `,
      [
        req.body.status,
        +req.params.id
      ]
    );

    res.json(jobOut(result.rows[0]));
  }
);

/* =========================================================
   USER DASHBOARD STATS
========================================================= */

app.get("/api/stats", auth, async (req, res) => {
  const applications = await q(
    `
    SELECT COUNT(*)::int AS n
    FROM applications
    WHERE user_id = $1
    `,
    [req.user.id]
  );

  const saved = await q(
    `
    SELECT COUNT(*)::int AS n
    FROM saved
    WHERE user_id = $1
    `,
    [req.user.id]
  );

  const interviews = await q(
    `
    SELECT COUNT(*)::int AS n
    FROM interviews
    WHERE user_id = $1
    `,
    [req.user.id]
  );

  const jobs = await q(
    `
    SELECT COUNT(*)::int AS n
    FROM jobs
    WHERE status = 'approved'
    `
  );

  res.json({
    applications: applications.rows[0].n,
    saved: saved.rows[0].n,
    interviews: interviews.rows[0].n,
    jobs: jobs.rows[0].n
  });
});

/* =========================================================
   FRONTEND FALLBACK
   IMPORTANT: Express 5 compatible
========================================================= */

app.get(/.*/, (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

/* =========================================================
   START SERVER
========================================================= */

init()
  .then(() => {
    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `CareerNexa listening on ${PORT}`
        );
      }
    );
  })
  .catch(error => {
    console.error(
      "CareerNexa startup failed:",
      error
    );

    process.exit(1);
  });
