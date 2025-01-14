const express = require('express');
const cors = require('cors');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 8080;
const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

if (!APP_ID || !APP_CERTIFICATE) {
  throw new Error('AGORA_APP_ID and AGORA_APP_CERTIFICATE are required');
}

app.post('/token', (req, res) => {
  const { channelName, uid } = req.body;

  if (!channelName) {
    return res.status(400).json({ error: 'Channel name is required' });
  }

  try {
    // Generate token
    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.build(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid || 0,
      role,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

    return res.json({ token });
  } catch (error) {
    console.error('Error generating token:', error);
    return res.status(500).json({
      error: 'Failed to generate token',
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Token server is running on port ${PORT}`);
});
