const express = require("express");
const router = express.Router();

const Notification = require("../models/Notification");
const authMiddleware = require("../middleware/authMiddleware");

// ==========================================
// GET MY NOTIFICATIONS
// GET /api/notifications
// ==========================================
router.get("/", authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user.id,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const unreadCount = notifications.filter(
      (notification) => !notification.isRead
    ).length;

    res.status(200).json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Fetch Notifications Error:", error);

    res.status(500).json({
      message: "Failed to load notifications.",
    });
  }
});

// ==========================================
// MARK ONE AS READ
// PUT /api/notifications/:id/read
// ==========================================
router.put("/:id/read", authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        recipient: req.user.id,
      },
      {
        isRead: true,
      },
      {
        new: true,
      }
    );

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found.",
      });
    }

    res.status(200).json({
      message: "Notification marked as read.",
      notification,
    });
  } catch (error) {
    console.error("Mark Notification Read Error:", error);

    res.status(500).json({
      message: "Failed to mark notification as read.",
    });
  }
});

// ==========================================
// MARK ALL AS READ
// PUT /api/notifications/read-all
// ==========================================
router.put("/read-all", authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany(
      {
        recipient: req.user.id,
        isRead: false,
      },
      {
        $set: { isRead: true },
      }
    );

    res.status(200).json({
      message: "All notifications marked as read.",
    });
  } catch (error) {
    console.error("Mark All Notifications Error:", error);

    res.status(500).json({
      message: "Failed to mark all notifications as read.",
    });
  }
});

// ==========================================
// DELETE ONE NOTIFICATION
// DELETE /api/notifications/:id
// ==========================================
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const deleted = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user.id,
    });

    if (!deleted) {
      return res.status(404).json({
        message: "Notification not found.",
      });
    }

    res.status(200).json({
      message: "Notification deleted.",
    });
  } catch (error) {
    console.error("Delete Notification Error:", error);

    res.status(500).json({
      message: "Failed to delete notification.",
    });
  }
});

module.exports = router;