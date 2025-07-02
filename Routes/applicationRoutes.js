const express = require("express");
const { body, query, validationResult } = require("express-validator");
const Application = require("../models/Application");
const Job = require("../models/Job");
const { authenticate, isEmployerOrAdmin } = require("../middleware/auth");

const router = express.Router();

// @route   POST /api/applications
// @desc    Apply to a job
// @access  Private
router.post(
  "/",
  authenticate,
  [
    body("jobId").isMongoId().withMessage("Invalid job ID"),
    body("resumeLink").isURL().withMessage("Resume link must be a valid URL"),
    body("coverLetter")
      .optional()
      .isLength({ max: 2000 })
      .withMessage("Cover letter cannot exceed 2000 characters"),
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

      const { jobId, resumeLink, coverLetter } = req.body;

      const job = await Job.findById(jobId);
      if (!job) {
        return res
          .status(404)
          .json({ success: false, message: "Job not found" });
      }

      if (!job.isActive) {
        return res
          .status(400)
          .json({
            success: false,
            message: "This job is no longer accepting applications",
          });
      }

      if (job.applicationDeadline && new Date() > job.applicationDeadline) {
        return res
          .status(400)
          .json({ success: false, message: "Application deadline has passed" });
      }

      const existingApplication = await Application.findOne({
        job: jobId,
        applicant: req.user._id,
      });
      if (existingApplication) {
        return res
          .status(400)
          .json({
            success: false,
            message: "You have already applied to this job",
          });
      }

      if (job.createdBy.toString() === req.user._id.toString()) {
        return res
          .status(400)
          .json({
            success: false,
            message: "You cannot apply to your own job posting",
          });
      }

      const application = new Application({
        job: jobId,
        applicant: req.user._id,
        resumeLink,
        coverLetter,
      });

      await application.save();
      await Job.findByIdAndUpdate(jobId, { $inc: { applicationsCount: 1 } });

      const populatedApplication = await Application.findById(application._id)
        .populate("job", "title company location type")
        .populate("applicant", "name email profile");

      res.status(201).json({
        success: true,
        message: "Application submitted successfully",
        data: { application: populatedApplication },
      });
    } catch (error) {
      console.error("Apply to job error:", error);
      res
        .status(500)
        .json({
          success: false,
          message: "Server error submitting application",
        });
    }
  }
);

// @route   GET /api/applications/my
// @desc    Get current user's applications
// @access  Private
router.get(
  "/my",
  authenticate,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
    query("status")
      .optional()
      .isIn([
        "pending",
        "reviewed",
        "shortlisted",
        "interviewed",
        "hired",
        "rejected",
      ]),
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

      const { page = 1, limit = 10, status } = req.query;
      const queryObj = { applicant: req.user._id };
      if (status) queryObj.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const [applications, total] = await Promise.all([
        Application.find(queryObj)
          .populate("job", "title company location type salary logo isActive")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Application.countDocuments(queryObj),
      ]);

      res.json({
        success: true,
        data: {
          applications,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalApplications: total,
            limit: parseInt(limit),
          },
        },
      });
    } catch (error) {
      console.error("Get my applications error:", error);
      res
        .status(500)
        .json({
          success: false,
          message: "Server error fetching applications",
        });
    }
  }
);

// @route   GET /api/applications/job/:jobId
// @desc    Get applicants for a specific job
// @access  Private (Job creator or Admin only)
router.get(
  "/job/:jobId",
  authenticate,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
    query("status")
      .optional()
      .isIn([
        "pending",
        "reviewed",
        "shortlisted",
        "interviewed",
        "hired",
        "rejected",
      ]),
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

      const { jobId } = req.params;
      const { page = 1, limit = 10, status } = req.query;

      const job = await Job.findById(jobId);
      if (!job) {
        return res
          .status(404)
          .json({ success: false, message: "Job not found" });
      }

      if (
        job.createdBy.toString() !== req.user._id.toString() &&
        req.user.role !== "admin"
      ) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "Access denied. You can only view applications for your own jobs.",
          });
      }

      const queryObj = { job: jobId };
      if (status) queryObj.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const [applications, total] = await Promise.all([
        Application.find(queryObj)
          .populate("applicant", "name email profile")
          .populate("reviewedBy", "name")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Application.countDocuments(queryObj),
      ]);

      res.json({
        success: true,
        data: {
          applications,
          job: {
            id: job._id,
            title: job.title,
            company: job.company,
          },
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalApplications: total,
            limit: parseInt(limit),
          },
        },
      });
    } catch (error) {
      console.error("Get job applications error:", error);
      res
        .status(500)
        .json({
          success: false,
          message: "Server error fetching job applications",
        });
    }
  }
);

// @route   PUT /api/applications/:id/status
// @desc    Update application status
// @access  Private (Job creator or Admin only)
router.put(
  "/:id/status",
  authenticate,
  [
    body("status")
      .isIn([
        "pending",
        "reviewed",
        "shortlisted",
        "interviewed",
        "hired",
        "rejected",
      ])
      .withMessage("Invalid status"),
    body("notes")
      .optional()
      .isLength({ max: 1000 })
      .withMessage("Notes cannot exceed 1000 characters"),
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

      const { status, notes } = req.body;
      const application = await Application.findById(req.params.id).populate(
        "job",
        "createdBy title company"
      );

      if (!application) {
        return res
          .status(404)
          .json({ success: false, message: "Application not found" });
      }

      if (
        application.job.createdBy.toString() !== req.user._id.toString() &&
        req.user.role !== "admin"
      ) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "Access denied. You can only update applications for your own jobs.",
          });
      }

      application.status = status;
      if (notes) application.notes = notes;
      application.reviewedBy = req.user._id;
      application.reviewedAt = new Date();

      await application.save();

      const updatedApplication = await Application.findById(application._id)
        .populate("applicant", "name email")
        .populate("job", "title company")
        .populate("reviewedBy", "name");

      res.json({
        success: true,
        message: "Application status updated successfully",
        data: { application: updatedApplication },
      });
    } catch (error) {
      console.error("Update application status error:", error);
      res
        .status(500)
        .json({
          success: false,
          message: "Server error updating application status",
        });
    }
  }
);

// @route   GET /api/applications/:id
// @desc    Get single application details
// @access  Private (Applicant, Job creator, or Admin only)
router.get("/:id", authenticate, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate("applicant", "name email profile")
      .populate("job", "title company location type salary createdBy")
      .populate("reviewedBy", "name");

    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    const isApplicant =
      application.applicant._id.toString() === req.user._id.toString();
    const isJobCreator =
      application.job.createdBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isApplicant && !isJobCreator && !isAdmin) {
      return res
        .status(403)
        .json({
          success: false,
          message:
            "Access denied. You can only view your own applications or applications to your jobs.",
        });
    }

    res.json({ success: true, data: { application } });
  } catch (error) {
    console.error("Get application error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error fetching application" });
  }
});

// @route   DELETE /api/applications/:id
// @desc    Withdraw application
// @access  Private (Applicant only)
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    if (application.applicant.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({
          success: false,
          message:
            "Access denied. You can only withdraw your own applications.",
        });
    }

    if (["hired", "rejected"].includes(application.status)) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Cannot withdraw application that has already been processed",
        });
    }

    await Promise.all([
      Application.findByIdAndDelete(req.params.id),
      Job.findByIdAndUpdate(application.job, {
        $inc: { applicationsCount: -1 },
      }),
    ]);

    res.json({ success: true, message: "Application withdrawn successfully" });
  } catch (error) {
    console.error("Withdraw application error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Server error withdrawing application",
      });
  }
});

module.exports = router;
