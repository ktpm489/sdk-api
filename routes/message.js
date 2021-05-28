const express = require("express");
const router = express.Router();
const oneSignal = require("../config/onesignal");
router.post("/", async (req, res) => {
  try {
    const oneSignalReceivedMessage = util.format(
      req.body.name,
       req.body.image,
      req.body.title,
      req.body.description,
    );
    const devices = [];
    req.body.devices.map((d) => {
      if (d) {
        if (d.oneSignalId !== "") devices.push(d.oneSignalId);
      }
    });
    if (devices.length > 0) {
      oneSignal.sendNotification(devices, oneSignalMessage);
    }
  } catch (err) {
    res.send("Error");
  }
});
