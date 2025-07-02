const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: [true, "Job reference is required"],
    },
    applicant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Applicant reference is required"],
    },
    coverLetter: {
      type: String,
      maxlength: [2000, "Cover letter cannot exceed 2000 characters"],
    },
    resumeLink: {
      type: String,
      required: [true, "Resume link is required"],
    },
    status: {
      type: String,
      enum: [
        "pending",
        "reviewed",
        "shortlisted",
        "interviewed",
        "hired",
        "rejected",
      ],
      default: "pending",
    },
    notes: {
      type: String, // Internal notes from employer
      maxlength: [1000, "Notes cannot exceed 1000 characters"],
    },
    reviewedAt: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate applications
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });

// Indexes for better query performance
applicationSchema.index({ applicant: 1, createdAt: -1 });
applicationSchema.index({ job: 1, status: 1, createdAt: -1 });
applicationSchema.index({ status: 1 });

// Pre-save middleware to set reviewedAt when status changes
applicationSchema.pre("save", function (next) {
  if (
    this.isModified("status") &&
    this.status !== "pending" &&
    !this.reviewedAt
  ) {
    this.reviewedAt = new Date();
  }
  next();
});

const Application = mongoose.model("Application", applicationSchema);

module.exports = Application;
