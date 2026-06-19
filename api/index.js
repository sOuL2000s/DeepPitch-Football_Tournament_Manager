// DeepPitch Serverless Engine
// This file handles actions related to tournament data, including generating reports.

const { COLORS, escapeHtml, getTN, getTC, getStats, getPlayerStats } = require('../../src/utils/tournamentHelpers');

// Helper to sanitize string inputs using the shared escapeHtml function
const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return escapeHtml(str.trim());
};

// Comprehensive validation and sanitization for the tournament object
const validateAndSanitizeTournament = (tournament) => {
  if (!tournament || typeof tournament !== 'object') {
    throw new Error("Invalid tournament data: expected an object.");
  }

  // Sanitize top-level properties
  tournament.name = sanitizeString(tournament.name);
  if (!tournament.name) throw new Error("Tournament name is required.");

  tournament.type = sanitizeString(tournament.type);
  const allowedTypes = ['LEAGUE', 'KNOCKOUT', 'GROUPS'];
  if (!allowedTypes.includes(tournament.type)) {
    throw new Error(`Invalid tournament type: "${tournament.type}". Allowed types are: ${allowedTypes.join(', ')}.`);
  }

  // Validate teams
  if (!Array.isArray(tournament.teams)) throw new Error("Invalid tournament data: teams must be an array.");
  tournament.teams = tournament.teams.map(team => {
    if (!team || typeof team !== 'object') throw new Error("Invalid team data: expected an object.");
    team.id = sanitizeString(team.id); 
    team.name = sanitizeString(team.name);
    if (!team.name) throw new Error("Team name is required for a team.");
    team.color = sanitizeString(team.color);

    if (!Array.isArray(team.players)) team.players = []; 
    team.players = team.players.map(player => {
      if (!player || typeof player !== 'object') throw new Error("Invalid player data: expected an object.");
      player.id = sanitizeString(player.id);
      player.name = sanitizeString(player.name);
      player.number = sanitizeString(player.number); // Player numbers can be string (e.g., '00', 'GK')
      return player;
    });
    return team;
  });

  // Validate matches
  if (!Array.isArray(tournament.matches)) throw new Error("Invalid tournament data: matches must be an array.");
  tournament.matches = tournament.matches.map(match => {
    if (!match || typeof match !== 'object') throw new Error("Invalid match data: expected an object.");
    match.id = sanitizeString(match.id);
    match.group = sanitizeString(match.group);
    // Ensure round is a number, default to null if invalid
    match.round = typeof match.round === 'number' ? match.round : (parseInt(match.round, 10) || null); 
    match.home = sanitizeString(match.home);
    match.away = sanitizeString(match.away);
    match.hScore = sanitizeString(match.hScore);
    match.aScore = sanitizeString(match.aScore);
    match.status = sanitizeString(match.status);
    match.winner = sanitizeString(match.winner);

    // Ensure done is boolean, default to false if not
    match.done = typeof match.done === 'boolean' ? match.done : false;
    // Ensure time is number, default to 0
    match.time = typeof match.time === 'number' ? match.time : (parseInt(match.time, 10) || 0);

    // Sanitize events
    if (!Array.isArray(match.events)) match.events = [];
    match.events = match.events.map(event => {
      if (!event || typeof event !== 'object') throw new Error("Invalid event data: expected an object.");
      event.type = sanitizeString(event.type);
      event.player = sanitizeString(event.player);
      event.teamId = sanitizeString(event.teamId);
      return event;
    });
    return match;
  });

  // Sanitize settings (minimal as they are internal config)
  if (tournament.settings && typeof tournament.settings === 'object') {
    tournament.settings.ptsWin = parseInt(tournament.settings.ptsWin, 10) || 0;
    tournament.settings.ptsDraw = parseInt(tournament.settings.ptsDraw, 10) || 0;
    tournament.settings.ptsLoss = parseInt(tournament.settings.ptsLoss, 10) || 0;
    if (!Array.isArray(tournament.settings.tieBreakers)) tournament.settings.tieBreakers = [];
    tournament.settings.tieBreakers = tournament.settings.tieBreakers.map(sanitizeString);
  } else {
    tournament.settings = {}; 
  }

  // Sanitize config (minimal)
  if (tournament.config && typeof tournament.config === 'object') {
    tournament.config.teamsPerGroup = parseInt(tournament.config.teamsPerGroup, 10) || 0;
    tournament.config.qualifiersCount = parseInt(tournament.config.qualifiersCount, 10) || 0;
    tournament.config.homeAwayEnabled = typeof tournament.config.homeAwayEnabled === 'boolean' ? tournament.config.homeAwayEnabled : false;
  } else {
    tournament.config = {};
  }

  return tournament; // Return the sanitized tournament object
};

// Generate HTML report content for a given tournament
const generateTournamentReportHTMLServer = (tournament, type) => {
  // `tournament` is now guaranteed to be validated and sanitized
  if (!tournament) return ""; // Should ideally not happen after validation
  const isFullReport = type === 'FULL_REPORT';
  const escapedName = tournament.name; // Already sanitized
  const escapedType = tournament.type; // Already sanitized
  const { scorers, assisters, cards } = getPlayerStats(tournament);

  const renderStandings = () => {
    if (tournament.type === 'GROUPS') {
      const groups = [...new Set(tournament.matches.filter(m => m.group).map(m => m.group))];
      return groups.map(g => `
        <h3 style="color:${COLORS.primary}; margin-top:15px">Group ${g}</h3>
        <table>
          <tr><th style="text-align:left">TEAM</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>PTS</th></tr>
          ${getStats({...tournament, matches: tournament.matches.filter(m => m.group === g)}).map(([id, s]) => `
            <tr><td class="team-name">${getTN(id, tournament)}</td><td>${s.p}</td><td>${s.w}</td><td>${s.d}</td><td>${s.l}</td><td>${s.gd}</td><td>${s.pts}</td></tr>
          `).join('')}
        </table>
      `).join('');
    }
    const stats = getStats(tournament);
    return `
      <table>
        <tr><th style="text-align:left">TEAM</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>PTS</th></tr>
        ${stats.map(([id, s]) => `
          <tr>
            <td class="team-name">${getTN(id, tournament)}</td>
            <td>${s.p}</td><td>${s.w}</td><td>${s.d}</td><td>${s.l}</td><td>${s.gd}</td><td>${s.pts}</td>
          </tr>
        `).join('')}
      </table>
    `;
  };

  const renderFixtures = () => {
    return `
      <table>
        <tr><th style="text-align:left">MATCH</th><th>ROUND/GROUP</th><th>RESULT</th></tr>
        ${tournament.matches.map(m => `
          <tr>
            <td class="team-name">${getTN(m.home, tournament)} vs ${getTN(m.away, tournament)}</td>
            <td style="color:${COLORS.muted}; font-size:10px">${m.group ? 'Group '+m.group : (m.round ? 'Round '+m.round : 'League')}</td>
            <td>${m.done ? `<b>${m.hScore} - ${m.aScore}</b>` : (m.status === 'LIVE' ? `<span style="color:${COLORS.primary}">LIVE</span>` : 'PENDING')}</td>
          </tr>
        `).join('')}
      </table>
    `;
  };

  return `
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica', sans-serif; padding: 20px; background: ${COLORS.bg}; color: ${COLORS.text}; }
          h1 { color: ${COLORS.primary}; text-align: center; margin-bottom: 5px; }
          h2 { color: ${COLORS.gold}; border-bottom: 2px solid ${COLORS.border}; padding-bottom: 5px; margin-top: 30px; }
          .meta { color: ${COLORS.muted}; text-align: center; margin-bottom: 20px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border-bottom: 1px solid ${COLORS.border}; padding: 10px; text-align: center; font-size: 12px; }
          th { color: ${COLORS.primary}; text-transform: uppercase; }
          .team-name { text-align: left; font-weight: bold; }
          .stat-box { display: inline-block; width: 30%; vertical-align: top; margin-right: 2%; }
        </style>
      </head>
      <body>
        <h1>${escapedName}</h1>
        <div class="meta">${escapedType} Tournament • ${tournament.teams.length} Teams</div>
        ${(isFullReport || type === 'STANDINGS') ? `<h2>Standings</h2> ${renderStandings()}` : ''}
        ${(isFullReport || type === 'FIXTURES') ? `<h2>Fixtures & Results</h2> ${renderFixtures()}` : ''}
        ${isFullReport ? `
          <h2>Player Statistics</h2>
          <div style="width: 100%;">
            <div class="stat-box">
              <h3 style="color:${COLORS.primary}">Top Scorers</h3>
              ${scorers.slice(0, 10).map(([n, c]) => `<div style="font-size:10px">${n}: <b>${c}</b></div>`).join('')}
            </div>
            <div class="stat-box">
              <h3 style="color:${COLORS.accent}">Top Assists</h3>
              ${assisters.slice(0, 10).map(([n, c]) => `<div style="font-size:10px">${n}: <b>${c}</b></div>`).join('')}
            </div>
            <div class="stat-box">
              <h3 style="color:${COLORS.danger}">Cards</h3>
              ${cards.slice(0, 10).map(([n, c]) => `<div style="font-size:10px">${n}: <b>${c}</b></div>`).join('')}
            </div>
          </div>
        ` : ''}
      </body>
    </html>
  `;
};

// Generate CSV report content for a given tournament
const generateCSVReport = (tournament) => {
  // `tournament` is now guaranteed to be validated and sanitized
  if (!tournament) return ''; // Should ideally not happen after validation
  let csv = "Match ID,Type,Home,Away,Home Score,Away Score,Status,Winner\n";
  tournament.matches.forEach(m => {
    // Ensure all values are strings and properly quoted for CSV safety, even though they are sanitized strings
    csv += `"${m.id}","${m.group ? 'Group '+m.group : (m.round ? 'Round '+m.round : 'League')}","${getTN(m.home, tournament)}","${getTN(m.away, tournament)}","${m.hScore}","${m.aScore}","${m.status}","${m.winner || ''}"\n`;
  });
  return csv;
};


module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // API Key Authentication
    const EXPECTED_API_KEY = process.env.SERVERLESS_API_KEY;
    const authorizationHeader = req.headers.authorization;

    if (!EXPECTED_API_KEY) {
      console.error("SERVERLESS_API_KEY environment variable is not set on the server.");
      return res.status(500).json({ success: false, error: "Server configuration error: API key missing." });
    }

    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      console.warn("Unauthorized access attempt: Missing or invalid Authorization header.");
      return res.status(401).json({ success: false, error: "Unauthorized: Missing or invalid Authorization header." });
    }

    const providedApiKey = authorizationHeader.split(' ')[1];

    if (providedApiKey !== EXPECTED_API_KEY) {
      console.warn("Unauthorized access attempt: Invalid API Key.");
      return res.status(403).json({ success: false, error: "Forbidden: Invalid API Key." });
    }
    // End API Key Authentication

    if (req.method === 'POST') {
      let { action, tournament, type } = req.body;

      console.log(`[${new Date().toISOString()}] Incoming Action: ${action}`);
      
      if (!action) {
        return res.status(400).json({ success: false, error: "No action specified" });
      }

      if (action === 'SHARE_ID') {
        if (!tournament || !tournament.name) {
          return res.status(400).json({ success: false, error: "Invalid tournament data: tournament name is required for sharing." });
        }
        // Sanitize name for use in message
        const sanitizedName = sanitizeString(tournament.name);
        const shareId = Buffer.from(`${tournament.id}-${Date.now()}`).toString('base64').substring(0, 8);
        return res.status(200).json({
          success: true,
          shareId,
          shareUrl: `https://deeppitch-engine.vercel.app/view/${shareId}`,
          syncTime: new Date().toISOString(),
          message: `Successfully synced ${sanitizedName} to DeepPitch Cloud`
        });
      }

      if (action === 'GENERATE_PDF_HTML' || action === 'GENERATE_CSV') {
        try {
          // Validate and sanitize the entire tournament object
          tournament = validateAndSanitizeTournament(tournament);
        } catch (validationError) {
          console.error("Tournament validation error:", validationError.message);
          return res.status(400).json({ success: false, error: validationError.message });
        }
      }

      if (action === 'GENERATE_PDF_HTML') {
        const htmlContent = generateTournamentReportHTMLServer(tournament, type);
        return res.status(200).json({ success: true, html: htmlContent });
      }

      if (action === 'GENERATE_CSV') {
        const csvContent = generateCSVReport(tournament);
        return res.status(200).json({ success: true, csv: csvContent });
      }

      // If action is unrecognized
      return res.status(400).json({ success: false, error: `Unrecognized action: ${action}` });
    }

    return res.status(200).json({ status: "DeepPitch Engine 1.1 Online. Awaiting POST actions." });
  } catch (err) {
    console.error("Serverless function error:", err);
    res.status(500).json({ error: err.message || "An unexpected server error occurred." });
  }
};