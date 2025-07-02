import express from "express";
import { body, query, validationResult } from "express-validator";
import Job from "../models/Job.js";
import Application from "../models/Application.js";
import {
  authenticate,
  isEmployerOrAdmin,
  optionalAuth,
} from "../middleware/auth.js";

const router = express.Router();

/**
 * @route   GET /api/jobs
 * @desc    Get all jobs with filters, search, and pagination
 * @access  Public
 */
router.get(
  "/",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
    query("minSalary")
      .optional()
      .isNumeric()
      .withMessage("Min salary must be a number"),
    query("maxSalary")
      .optional()
      .isNumeric()
      .withMessage("Max salary must be a number"),
  ],
  optionalAuth,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Validation failed",
            errors: errors.array(),
          });
      }

      const {
        page = 1,
        limit = 10,
        keyword,
        location,
        type,
        category,
        minSalary,
        maxSalary,
        experienceLevel,
        sortBy = "createdAt",
        sortOrder = "desc",
        featured,
      } = req.query;

      const query = { isActive: true };

      if (keyword) {
        query.$text = { $search: keyword };
      }

      if (location) {
        query.location = new RegExp(location, "i");
      }

      if (type) {
        query.type = Array.isArray(type) ? { $in: type } : type;
      }

      if (category) {
        query.category = Array.isArray(category) ? { $in: category } : category;
      }

      if (experienceLevel) {
        query.experienceLevel = Array.isArray(experienceLevel)
          ? { $in: experienceLevel }
          : experienceLevel;
      }

      if (minSalary || maxSalary) {
        query["salary.min"] = {};
        if (minSalary) query["salary.min"].$gte = parseInt(minSalary);
        if (maxSalary) query["salary.max"] = { $lte: parseInt(maxSalary) };
      }

      if (featured === "true") {
        query.featured = true;
      }

      const sortOptions = {};
      if (keyword) {
        sortOptions.score = { $meta: "textScore" };
      }
      if (sortBy === "salary") {
        sortOptions["salary.min"] = sortOrder === "desc" ? -1 : 1;
      } else if (sortBy === "applications") {
        sortOptions.applicationsCount = sortOrder === "desc" ? -1 : 1;
      } else {
        sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [jobs, total] = await Promise.all([
        Job.find(query)
          .populate("createdBy", "name company.name")
          .sort(sortOptions)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Job.countDocuments(query),
      ]);

      let jobsWithStatus = jobs;
      if (req.user) {
        const userApplications = await Application.find({
          applicant: req.user._id,
          job: { $in: jobs.map((j) => j._id) },
        }).select("job status");

        const appMap = userApplications.reduce((acc, app) => {
          acc[app.job.toString()] = app.status;
          return acc;
        }, {});

        jobsWithStatus = jobs.map((job) => ({
          ...job,
          userApplicationStatus: appMap[job._id.toString()] || null,
        }));
      }

      res.json({
        success: true,
        data: {
          jobs: jobsWithStatus,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalJobs: total,
            limit: parseInt(limit),
            hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
            hasPrev: parseInt(page) > 1,
          },
        },
      });
    } catch (error) {
      console.error("Get jobs error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error fetching jobs" });
    }
  }
);

/**
 * @route   GET /api/jobs/:id
 * @desc    Get single job by ID
 * @access  Public
 */
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate("createdBy", "name email company")
      .lean();

    if (!job || !job.isActive) {
      return res
        .status(404)
        .json({ success: false, message: "Job not found or inactive" });
    }

    await Job.findByIdAndUpdate(req.params.id, { $inc: { viewsCount: 1 } });

    let userApplicationStatus = null;
    if (req.user) {
      const application = await Application.findOne({
        job: req.params.id,
        applicant: req.user._id,
      }).select("status");
      userApplicationStatus = application ? application.status : null;
    }

    res.json({
      success: true,
      data: {
        job: { ...job, userApplicationStatus },
      },
    });
  } catch (error) {
    console.error("Get job error:", error);
    if (error.name === "CastError") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid job ID format" });
    }
    res
      .status(500)
      .json({ success: false, message: "Server error fetching job" });
  }
});

/**
 * @route   POST /api/jobs
 * @desc    Create new job
 * @access  Private (Employer/Admin)
 */
router.post(
  "/",
  authenticate,
  isEmployerOrAdmin,
  [
    body("title")
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage("Title must be 3–100 characters"),
    body("company")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Company name must be 2–100 characters"),
    body("description")
      .trim()
      .isLength({ min: 50, max: 5000 })
      .withMessage("Description must be 50–5000 characters"),
    body("location")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Location must be 2–100 characters"),
    body("type")
      .isIn(["full-time", "part-time", "contract", "internship", "remote"])
      .withMessage("Invalid type"),
    body("category")
      .isIn([
        "technology",
        "marketing",
        "design",
        "sales",
        "finance",
        "healthcare",
        "education",
        "engineering",
        "operations",
        "customer-service",
        "other",
      ])
      .withMessage("Invalid category"),
    body("experienceLevel")
      .optional()
      .isIn(["entry", "mid", "senior", "lead", "executive"])
      .withMessage("Invalid level"),
    body("salary.min")
      .optional()
      .isNumeric()
      .withMessage("Min salary must be a number"),
    body("salary.max")
      .optional()
      .isNumeric()
      .withMessage("Max salary must be a number"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Validation failed",
            errors: errors.array(),
          });
      }

      const jobData = { ...req.body, createdBy: req.user._id };

      if (jobData.tags && Array.isArray(jobData.tags)) {
        jobData.tags = [
          ...new Set(jobData.tags.map((tag) => tag.toLowerCase().trim())),
        ];
      }

      const job = new Job(jobData);
      await job.save();

      const populatedJob = await Job.findById(job._id).populate(
        "createdBy",
        "name email company"
      );

      res
        .status(201)
        .json({
          success: true,
          message: "Job created successfully",
          data: { job: populatedJob },
        });
    } catch (error) {
      console.error("Create job error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error creating job" });
    }
  }
);

/**
 * @route   PUT /api/jobs/:id
 * @desc    Update job
 * @access  Private (Creator/Admin)
 */
router.put("/:id", authenticate, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    if (
      job.createdBy.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const allowedUpdates = [
      "title",
      "company",
      "description",
      "requirements",
      "location",
      "type",
      "category",
      "salary",
      "tags",
      "logo",
      "experienceLevel",
      "benefits",
      "applicationDeadline",
      "isActive",
      "featured",
    ];

    const updates = {};
    for (const key of Object.keys(req.body)) {
      if (allowedUpdates.includes(key)) updates[key] = req.body[key];
    }

    if (updates.tags && Array.isArray(updates.tags)) {
      updates.tags = [
        ...new Set(updates.tags.map((tag) => tag.toLowerCase().trim())),
      ];
    }

    const updatedJob = await Job.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate("createdBy", "name email company");

    res.json({
      success: true,
      message: "Job updated successfully",
      data: { job: updatedJob },
    });
  } catch (error) {
    console.error("Update job error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error updating job" });
  }
});

/**
 * @route   DELETE /api/jobs/:id
 * @desc    Delete job
 * @access  Private (Creator/Admin)
 */
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    if (
      job.createdBy.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    await Promise.all([
      Job.findByIdAndDelete(req.params.id),
      Application.deleteMany({ job: req.params.id }),
    ]);

    res.json({ success: true, message: "Job deleted successfully" });
  } catch (error) {
    console.error("Delete job error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error deleting job" });
  }
});

/**
 * @route   GET /api/jobs/my/posted
 * @desc    Get current user's posted jobs
 * @access  Private (Employer/Admin)
 */
router.get("/my/posted", authenticate, isEmployerOrAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, status = "all" } = req.query;

    const query = { createdBy: req.user._id };
    if (status === "active") query.isActive = true;
    else if (status === "inactive") query.isActive = false;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [jobs, total] = await Promise.all([
      Job.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Job.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalJobs: total,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Get posted jobs error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error fetching posted jobs" });
  }
});

export default router;
