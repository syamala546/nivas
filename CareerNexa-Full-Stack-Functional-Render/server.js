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

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});


// =====================================================
// DATABASE HELPER
// =====================================================

async function q(sql, params = []) {
  if (!pool) {
    throw Error(
      "DATABASE_URL is missing. Connect a Render PostgreSQL database."
    );
  }

  return pool.query(sql, params);
}


// =====================================================
// DATABASE INITIALIZATION
// =====================================================

async function init() {

  // USERS
  await q(`
    CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      mobile TEXT
    )
  `);

  // Existing databases may already have users table
  await q(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS mobile TEXT
  `);


  // PROFILES
  await q(`
    CREATE TABLE IF NOT EXISTS profiles(
      user_id INT PRIMARY KEY
        REFERENCES users(id)
        ON DELETE CASCADE,

      experience TEXT DEFAULT 'Fresher',
      role TEXT DEFAULT '',
      location TEXT DEFAULT '',
      skills TEXT DEFAULT ''
    )
  `);


  // SAVED JOBS
  await q(`
    CREATE TABLE IF NOT EXISTS saved(
      user_id INT
        REFERENCES users(id)
        ON DELETE CASCADE,

      job_id INT,

      PRIMARY KEY(user_id, job_id)
    )
  `);


  // APPLICATIONS
  await q(`
    CREATE TABLE IF NOT EXISTS applications(
      id SERIAL PRIMARY KEY,

      user_id INT
        REFERENCES users(id)
        ON DELETE CASCADE,

      job_id INT,

      status TEXT DEFAULT 'Applied',

      created_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(user_id, job_id)
    )
  `);


  // RESUMES
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


  // INTERVIEWS
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

  console.log("Database initialized successfully.");
}


// =====================================================
// JOB DATA
// =====================================================

const jobs = [

  {
    id: 1,
    title: "Frontend Developer Intern",
    company: "PixelSpring",
    location: "Hyderabad / Remote",
    level: "Fresher",
    type: "Internship",
    salary: "₹15k–₹25k/month",
    skills: [
      "HTML",
      "CSS",
      "JavaScript",
      "React"
    ],
    description:
      "Entry-level frontend role with mentorship."
  },

  {
    id: 2,
    title: "Graduate Software Engineer",
    company: "Northstar Labs",
    location: "Bengaluru",
    level: "Fresher",
    type: "Full-time",
    salary: "₹4–7 LPA",
    skills: [
      "Java",
      "SQL",
      "Git"
    ],
    description:
      "Graduate engineering role with training."
  },

  {
    id: 3,
    title: "Junior React Developer",
    company: "CloudMint",
    location: "Remote",
    level: "0–1 years",
    type: "Full-time",
    salary: "₹5–8 LPA",
    skills: [
      "React",
      "JavaScript",
      "TypeScript"
    ],
    description:
      "Build modern frontend experiences."
  },

  {
    id: 4,
    title: "Data Analyst Trainee",
    company: "MetricLeaf",
    location: "Chennai",
    level: "Fresher",
    type: "Trainee",
    salary: "₹3–5 LPA",
    skills: [
      "SQL",
      "Excel",
      "Python"
    ],
    description:
      "Reporting and data quality projects."
  },

  {
    id: 5,
    title: "Backend Developer",
    company: "StackHarbor",
    location: "Pune",
    level: "2+ years",
    type: "Full-time",
    salary: "₹10–16 LPA",
    skills: [
      "Node.js",
      "PostgreSQL",
      "APIs"
    ],
    description:
      "Backend services role requiring experience."
  },

  {
    id: 6,
    title: "QA Engineer Intern",
    company: "BrightTest",
    location: "Remote",
    level: "Fresher",
    type: "Internship",
    salary: "₹12k–₹20k/month",
    skills: [
      "Testing",
      "SQL",
      "JavaScript"
    ],
    description:
      "Learn testing, bug reporting, and automation."
  }

];


// =====================================================
// AUTHENTICATION
// =====================================================

function auth(req, res, next) {

  try {

    const header = req.headers.authorization || "";

    const token = header.replace(/^Bearer /, "");

    req.user = jwt.verify(token, SECRET);

    next();

  } catch {

    return res.status(401).json({
      error: "Please log in again."
    });

  }

}


// =====================================================
// MSG91 SMS
// =====================================================

async function sendSMS(mobile, jobTitle) {

  try {

    const authKey = process.env.MSG91_AUTHKEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;

    if (!authKey || !templateId) {

      console.log(
        "MSG91 not configured. SMS skipped."
      );

      return {
        sent: false,
        reason: "MSG91 environment variables missing"
      };

    }


    let cleanMobile = String(mobile || "")
      .replace(/\D/g, "");


    if (!cleanMobile) {

      console.log(
        "No mobile number available."
      );

      return {
        sent: false,
        reason: "No mobile number"
      };

    }


    // India country code
    if (!cleanMobile.startsWith("91")) {
      cleanMobile = "91" + cleanMobile;
    }


    const response = await fetch(
      "https://control.msg91.com/api/v5/flow",
      {
        method: "POST",

        headers: {
          accept: "application/json",
          authkey: authKey,
          "content-type": "application/json"
        },

        body: JSON.stringify({

          template_id: templateId,

          short_url: "0",

          recipients: [

            {
              mobiles: cleanMobile,

              VAR1: jobTitle
            }

          ]

        })
      }
    );


    const data = await response.json();


    if (!response.ok) {

      console.error(
        "MSG91 error:",
        data
      );

      return {
        sent: false,
        reason: "MSG91 rejected request",
        data
      };

    }


    console.log(
      "SMS request successful:",
      data
    );


    return {
      sent: true,
      data
    };

  } catch (error) {

    console.error(
      "SMS error:",
      error
    );

    return {
      sent: false,
      reason: error.message
    };

  }

}


// =====================================================
// HEALTH
// =====================================================

app.get(
  "/api/health",
  (req, res) => {

    res.json({
      ok: true,
      database: !!pool,
      smsConfigured:
        !!process.env.MSG91_AUTHKEY &&
        !!process.env.MSG91_TEMPLATE_ID
    });

  }
);


// =====================================================
// REGISTER
// =====================================================

app.post(
  "/api/register",
  async (req, res) => {

    try {

      const {
        name,
        mobile,
        email,
        password
      } = req.body;


      if (
        !name ||
        !mobile ||
        !email ||
        !password ||
        password.length < 8
      ) {

        return res.status(400).json({
          error:
            "Name, mobile, email and password (8+ characters) are required."
        });

      }


      // Basic Indian mobile validation
      const cleanMobile =
        String(mobile).replace(/\D/g, "");


      if (
        cleanMobile.length !== 10
      ) {

        return res.status(400).json({
          error:
            "Please enter a valid 10-digit mobile number."
        });

      }


      const hash =
        await bcrypt.hash(password, 12);


      const r = await q(
        `
        INSERT INTO users(
          name,
          email,
          password_hash,
          mobile
        )
        VALUES($1,$2,$3,$4)
        RETURNING id,name,email,mobile
        `,
        [
          name,
          email.toLowerCase(),
          hash,
          cleanMobile
        ]
      );


      const u = r.rows[0];


      await q(
        `
        INSERT INTO profiles(user_id)
        VALUES($1)
        `,
        [u.id]
      );


      const token = jwt.sign(
        {
          id: u.id
        },
        SECRET,
        {
          expiresIn: "7d"
        }
      );


      res.json({
        token,
        user: u
      });


    } catch (e) {

      console.error(e);


      res.status(
        e.code === "23505"
          ? 409
          : 500
      ).json({

        error:
          e.code === "23505"
            ? "Email already registered."
            : "Registration failed. Check database."

      });

    }

  }
);


// =====================================================
// LOGIN
// =====================================================

app.post(
  "/api/login",
  async (req, res) => {

    try {

      const r = await q(
        `
        SELECT *
        FROM users
        WHERE email=$1
        `,
        [
          (req.body.email || "")
            .toLowerCase()
        ]
      );


      const u = r.rows[0];


      if (
        !u ||
        !await bcrypt.compare(
          req.body.password || "",
          u.password_hash
        )
      ) {

        return res.status(401).json({
          error:
            "Email or password is incorrect."
        });

      }


      const token = jwt.sign(
        {
          id: u.id
        },
        SECRET,
        {
          expiresIn: "7d"
        }
      );


      res.json({

        token,

        user: {
          id: u.id,
          name: u.name,
          email: u.email,
          mobile: u.mobile
        }

      });


    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          "Login failed. Check database."
      });

    }

  }
);


// =====================================================
// CURRENT USER
// =====================================================

app.get(
  "/api/me",
  auth,
  async (req, res) => {

    try {

      const r = await q(
        `
        SELECT
          u.id,
          u.name,
          u.email,
          u.mobile,
          p.experience,
          p.role,
          p.location,
          p.skills

        FROM users u

        JOIN profiles p
          ON p.user_id = u.id

        WHERE u.id=$1
        `,
        [req.user.id]
      );


      res.json(
        r.rows[0] || {}
      );

    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          "Could not load profile."
      });

    }

  }
);


// =====================================================
// UPDATE PROFILE
// =====================================================

app.put(
  "/api/profile",
  auth,
  async (req, res) => {

    try {

      const b = req.body;


      await q(
        `
        UPDATE users
        SET
          name=$1,
          mobile=$2

        WHERE id=$3
        `,
        [
          b.name,
          b.mobile,
          req.user.id
        ]
      );


      const r = await q(
        `
        UPDATE profiles

        SET
          experience=$1,
          role=$2,
          location=$3,
          skills=$4

        WHERE user_id=$5

        RETURNING *
        `,
        [
          b.experience,
          b.role,
          b.location,
          b.skills,
          req.user.id
        ]
      );


      res.json(
        r.rows[0]
      );


    } catch (e) {

      console.error(e);

      res.status(500).json({
        error:
          "Profile update failed."
      });

    }

  }
);


// =====================================================
// JOBS
// =====================================================

app.get(
  "/api/jobs",
  (req, res) => {

    const {
      q: search = "",
      level = "",
      location = "",
      type = ""
    } = req.query;


    const result = jobs.filter(
      j =>

        (
          !search ||
          JSON.stringify(j)
            .toLowerCase()
            .includes(
              search.toLowerCase()
            )
        )

        &&

        (
          !level ||
          j.level === level
        )

        &&

        (
          !location ||
          j.location
            .toLowerCase()
            .includes(
              location.toLowerCase()
            )
        )

        &&

        (
          !type ||
          j.type === type
        )
    );


    res.json(result);

  }
);


// =====================================================
// SAVED JOBS
// =====================================================

app.get(
  "/api/saved",
  auth,
  async (req, res) => {

    const r = await q(
      `
      SELECT job_id
      FROM saved
      WHERE user_id=$1
      `,
      [req.user.id]
    );


    res.json(
      r.rows.map(
        x => x.job_id
      )
    );

  }
);


app.post(
  "/api/saved/:id",
  auth,
  async (req, res) => {

    const id = +req.params.id;


    const r = await q(
      `
      SELECT 1
      FROM saved
      WHERE user_id=$1
      AND job_id=$2
      `,
      [
        req.user.id,
        id
      ]
    );


    if (r.rowCount) {

      await q(
        `
        DELETE FROM saved
        WHERE user_id=$1
        AND job_id=$2
        `,
        [
          req.user.id,
          id
        ]
      );

    } else {

      await q(
        `
        INSERT INTO saved(
          user_id,
          job_id
        )
        VALUES($1,$2)
        `,
        [
          req.user.id,
          id
        ]
      );

    }


    res.json({
      saved: !r.rowCount
    });

  }
);


// =====================================================
// APPLICATIONS
// =====================================================

app.get(
  "/api/applications",
  auth,
  async (req, res) => {

    const r = await q(
      `
      SELECT *
      FROM applications

      WHERE user_id=$1

      ORDER BY created_at DESC
      `,
      [req.user.id]
    );


    res.json(

      r.rows.map(
        a => ({

          ...a,

          job:
            jobs.find(
              j =>
                j.id === a.job_id
            )

        })
      )

    );

  }
);


// =====================================================
// APPLY + REAL SMS
// =====================================================

app.post(
  "/api/applications/:id",
  auth,
  async (req, res) => {

    try {

      const jobId =
        +req.params.id;


      // Find job
      const job =
        jobs.find(
          j => j.id === jobId
        );


      if (!job) {

        return res.status(404).json({
          error:
            "Job not found."
        });

      }


      // Get user mobile
      const userResult =
        await q(
          `
          SELECT
            name,
            mobile

          FROM users

          WHERE id=$1
          `,
          [req.user.id]
        );


      const user =
        userResult.rows[0];


      if (!user) {

        return res.status(404).json({
          error:
            "User not found."
        });

      }


      // Save application
      const application =
        await q(
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

          ON CONFLICT(
            user_id,
            job_id
          )

          DO UPDATE SET
            status='Applied'

          RETURNING *
          `,
          [
            req.user.id,
            jobId
          ]
        );


      // Send real SMS
      const sms =
        await sendSMS(
          user.mobile,
          job.title
        );


      console.log(
        "Application created:",
        application.rows[0]
      );


      console.log(
        "SMS result:",
        sms
      );


      res.json({

        ...application.rows[0],

        smsSent:
          sms.sent,

        message:
          sms.sent
            ? "Application submitted and SMS sent."
            : "Application submitted. SMS was not sent."

      });


    } catch (error) {

      console.error(
        "Application error:",
        error
      );


      res.status(500).json({

        error:
          "Application failed."

      });

    }

  }
);


// =====================================================
// UPDATE APPLICATION STATUS
// =====================================================

app.patch(
  "/api/applications/:id",
  auth,
  async (req, res) => {

    const allowed = [
      "Applied",
      "Assessment",
      "Interview",
      "Offer",
      "Rejected",
      "Withdrawn"
    ];


    if (
      !allowed.includes(
        req.body.status
      )
    ) {

      return res.status(400).json({
        error:
          "Invalid status"
      });

    }


    const r = await q(
      `
      UPDATE applications

      SET status=$1

      WHERE id=$2
      AND user_id=$3

      RETURNING *
      `,
      [
        req.body.status,
        +req.params.id,
        req.user.id
      ]
    );


    res.json(
      r.rows[0]
    );

  }
);


// =====================================================
// DELETE APPLICATION
// =====================================================

app.delete(
  "/api/applications/:id",
  auth,
  async (req, res) => {

    await q(
      `
      DELETE FROM applications

      WHERE id=$1
      AND user_id=$2
      `,
      [
        +req.params.id,
        req.user.id
      ]
    );


    res.json({
      ok: true
    });

  }
);


// =====================================================
// RESUME ANALYZER
// =====================================================

app.post(
  "/api/resume",
  auth,
  upload.single("resume"),
  async (req, res) => {

    if (!req.file) {

      return res.status(400).json({
        error:
          "Choose a file first"
      });

    }


    const extension =
      path.extname(
        req.file.originalname
      ).toLowerCase();


    const text =
      [".txt", ".md"].includes(
        extension
      )
        ? req.file.buffer.toString()
        : "";


    const checks = [

      [
        "Contact details",
        /email|@|phone/i.test(text)
      ],

      [
        "Skills",
        /skills/i.test(text)
      ],

      [
        "Education",
        /education|degree|college|university/i.test(text)
      ],

      [
        "Projects/experience",
        /project|experience|internship/i.test(text)
      ],

      [
        "Action verbs",
        /built|created|developed|implemented/i.test(text)
      ]

    ];


    const analysis = {

      score:
        40 +
        checks.filter(
          x => x[1]
        ).length * 12,

      checks,

      suggestions:
        checks
          .filter(
            x => !x[1]
          )
          .map(
            x => "Review " + x[0]
          )

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

      note:
        text
          ? "Basic text checks completed."
          : "File received; PDF/DOCX text extraction needs a parser."

    });

  }
);


// =====================================================
// INTERVIEW
// =====================================================

app.post(
  "/api/interview",
  auth,
  async (req, res) => {

    const answers =
      (req.body.answers || [])
        .filter(
          x =>
            String(x).trim()
        );


    const score =
      Math.min(
        100,

        Math.round(

          answers.length /
            5 *
            55

          +

          Math.min(
            answers
              .join(" ")
              .split(/\s+/)
              .length,

            200
          )
          /
          200
          *
          45

        )
      );


    await q(
      `
      INSERT INTO interviews(
        user_id,
        role,
        score,
        answers
      )

      VALUES(
        $1,
        $2,
        $3,
        $4
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

      answered:
        answers.length,

      feedback:
        "Use specific examples, clear structure, and measurable outcomes. For behavioral answers, try Situation → Task → Action → Result."

    });

  }
);


// =====================================================
// FRONTEND
// =====================================================

app.get(
  "*",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public/index.html"
      )
    );

  }
);


// =====================================================
// START SERVER
// =====================================================

init()

  .then(() => {

    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          "CareerNexa listening on " +
          PORT
        );

      }
    );

  })

  .catch(error => {

    console.error(
      "Server startup failed:",
      error
    );

    process.exit(1);

  });
