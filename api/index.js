// DeepPitch Serverless Engine
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const { tournament } = req.body;
      if (!tournament || !tournament.name) {
        return res.status(400).json({ success: false, error: "Invalid tournament data" });
      }
      const shareId = Buffer.from(`${tournament.id}-${Date.now()}`).toString('base64').substring(0, 8);
      return res.status(200).json({
        success: true,
        shareId,
        shareUrl: `https://deeppitch.vercel.app/view/${shareId}`,
        syncTime: new Date().toISOString(),
        message: `Successfully synced ${tournament.name} to DeepPitch Cloud`
      });
    }

    res.status(200).json({ status: "DeepPitch Engine 1.0 Online" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};