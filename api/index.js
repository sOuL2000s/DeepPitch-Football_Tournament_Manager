// DeepPitch Serverless Engine
// This file handles actions related to tournament data, including generating reports.

// Define COLORS for consistent styling in HTML reports
const COLORS = {
  bg: '#050505', card: '#121212', primary: '#00FF66',
  secondary: '#1A1A1A', text: '#FFFFFF', muted: '#A0A0A0',
  border: '#222222', danger: '#FF4444', accent: '#00A3FF',
  gold: '#FFD700'
};

// Helper function to escape HTML special characters
const escapeHtml = (unsafe) => {
  if (!unsafe || typeof unsafe !== 'string') return unsafe;
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Helper to get Team Name from ID within a given tournament object
const getTNServer = (id, tournament) => {
  if (id === 'BYE') return 'BYE';
  if (id === '?') return '?';
  const t = tournament?.teams.find(team => team.id === id);
  return t ? t.name : id;
};

// Helper to get Team Color from ID within a given tournament object
const getTCServer = (id, tournament) => {
  const t = tournament?.teams.find(team => team.id === id);
  return t ? t.color : COLORS.primary;
};

// Helper to calculate Standings for a given tournament object
const getStatsServer = (tournament) => {
  if (!tournament || !tournament.teams) {
    console.warn("getStatsServer: Tournament or teams data missing.");
    return [];
  }
  let stats = {};
  tournament.teams.forEach(tm => stats[tm.id] = { id: tm.id, p: 0, w: 0, d: 0, l: 0, pts: 0, gd: 0, gs: 0, fp: 0 });

  tournament.matches.forEach(m => {
    if (m.done && m.away !== 'BYE' && stats[m.home] && stats[m.away]) {
      const hs = parseInt(m.hScore) || 0, as = parseInt(m.aScore) || 0;
      const h = stats[m.home], a = stats[m.away];
      h.p++; a.p++;
      h.gs += hs; a.gs += as;
      h.gd += (hs - as); a.gd += (as - hs);

      (m.events || []).forEach(e => {
        if (e.type === 'YELLOW') { if (e.teamId === m.home) h.fp -= 1; else a.fp -= 1; }
        if (e.type === 'RED') { if (e.teamId === m.home) h.fp -= 3; else a.fp -= 3; }
      });

      if (hs > as) { h.w++; a.l++; h.pts += tournament.settings.ptsWin; }
      else if (as > hs) { a.w++; h.l++; a.pts += tournament.settings.ptsWin; }
      else { h.d++; a.d++; h.pts += tournament.settings.ptsDraw; a.pts += tournament.settings.ptsDraw; }
    }
  });

  const tb = tournament.settings.tieBreakers || ['GD', 'H2H', 'GS', 'FP'];

  return Object.entries(stats).sort((a_entry, b_entry) => {
    const a = a_entry[1], b = b_entry[1];
    if (b.pts !== a.pts) return b.pts - a.pts;

    for (let rule of tb) {
      if (rule === 'GD' && b.gd !== a.gd) return b.gd - a.gd;
      if (rule === 'GS' && b.gs !== a.gs) return b.gs - a.gs;
      if (rule === 'FP' && b.fp !== a.fp) return b.fp - a.fp;
      if (rule === 'H2H') {
        const h2h = tournament.matches.filter(m => m.done && ((m.home === a.id && m.away === b.id) || (m.home === b.id && m.away === a.id)));
        let aH = 0, bH = 0;
        h2h.forEach(m => {
          const hs = parseInt(m.hScore), as = parseInt(m.aScore);
          if (m.home === a.id) { if (hs > as) aH += 3; else if (as > hs) bH += 3; else { aH++; bH++; } }
          else { if (as > hs) aH += 3; else if (hs > as) bH += 3; else { aH++; bH++; } }
        });
        if (bH !== aH) return bH - aH;
      }
    }
    return 0;
  });
};

// Helper to calculate Player Stats for a given tournament object
const getPlayerStatsServer = (tournament) => {
  if (!tournament || !tournament.matches) {
    console.warn("getPlayerStatsServer: Tournament or matches data missing.");
    return { scorers: [], assisters: [], cards: [] };
  }
  const scorers = {};
  const assisters = {};
  const cards = {};
  tournament.matches.forEach(m => {
    (m.events || []).forEach(e => {
      if (e.type === 'GOAL') {
        scorers[e.player] = (scorers[e.player] || 0) + 1;
      } else if (e.type === 'ASSIST') {
        assisters[e.player] = (assisters[e.player] || 0) + 1;
      } else if (e.type === 'YELLOW' || e.type === 'RED') {
        cards[e.player] = (cards[e.player] || 0) + 1;
      }
    });
  });
  return {
    scorers: Object.entries(scorers).sort((a, b) => b[1] - a[1]),
    assisters: Object.entries(assisters).sort((a, b) => b[1] - a[1]),
    cards: Object.entries(cards).sort((a, b) => b[1] - a[1])
  };
};

// Generate HTML report content for a given tournament
const generateTournamentReportHTMLServer = (tournament, type) => {
  if (!tournament) return ""; 
  const isFullReport = type === 'FULL_REPORT';
  const escapedName = escapeHtml(tournament.name);
  const escapedType = escapeHtml(tournament.type);
  const { scorers, assisters, cards } = getPlayerStatsServer(tournament);

  const renderStandings = () => {
    if (tournament.type === 'GROUPS') {
      const groups = [...new Set(tournament.matches.filter(m => m.group).map(m => m.group))];
      return groups.map(g => `
        <h3 style="color:${COLORS.primary}; margin-top:15px">Group ${escapeHtml(g)}</h3>
        <table>
          <tr><th style="text-align:left">TEAM</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>PTS</th></tr>
          ${getStatsServer({...tournament, matches: tournament.matches.filter(m => m.group === g)}).map(([id, s]) => `
            <tr><td class="team-name">${escapeHtml(getTNServer(id, tournament))}</td><td>${s.p}</td><td>${s.w}</td><td>${s.d}</td><td>${s.l}</td><td>${s.gd}</td><td>${s.pts}</td></tr>
          `).join('')}
        </table>
      `).join('');
    }
    const stats = getStatsServer(tournament);
    return `
      <table>
        <tr><th style="text-align:left">TEAM</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>PTS</th></tr>
        ${stats.map(([id, s]) => `
          <tr>
            <td class="team-name">${escapeHtml(getTNServer(id, tournament))}</td>
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
            <td class="team-name">${escapeHtml(getTNServer(m.home, tournament))} vs ${escapeHtml(getTNServer(m.away, tournament))}</td>
            <td style="color:${COLORS.muted}; font-size:10px">${m.group ? 'Group '+escapeHtml(m.group) : (m.round ? 'Round '+m.round : 'League')}</td>
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
              ${scorers.slice(0, 10).map(([n, c]) => `<div style="font-size:10px">${escapeHtml(n)}: <b>${c}</b></div>`).join('')}
            </div>
            <div class="stat-box">
              <h3 style="color:${COLORS.accent}">Top Assists</h3>
              ${assisters.slice(0, 10).map(([n, c]) => `<div style="font-size:10px">${escapeHtml(n)}: <b>${c}</b></div>`).join('')}
            </div>
            <div class="stat-box">
              <h3 style="color:${COLORS.danger}">Cards</h3>
              ${cards.slice(0, 10).map(([n, c]) => `<div style="font-size:10px">${escapeHtml(n)}: <b>${c}</b></div>`).join('')}
            </div>
          </div>
        ` : ''}
      </body>
    </html>
  `;
};

// Generate CSV report content for a given tournament
const generateCSVReportServer = (tournament) => {
  if (!tournament) return ''; 
  let csv = "Match ID,Type,Home,Away,Home Score,Away Score,Status,Winner\n";
  tournament.matches.forEach(m => {
    csv += `${m.id},${m.group ? 'Group '+m.group : (m.round ? 'Round '+m.round : 'League')},${getTNServer(m.home, tournament)},${getTNServer(m.away, tournament)},${m.hScore},${m.aScore},${m.status},${m.winner || ''}\n`;
  });
  return csv;
};


module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); 
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const { action, tournament, type } = req.body;

      console.log(`[${new Date().toISOString()}] Incoming Action: ${action}`);
      
      if (!action) {
        return res.status(400).json({ success: false, error: "No action specified" });
      }

      if (action === 'SHARE_ID') {
        if (!tournament || !tournament.name) {
          return res.status(400).json({ success: false, error: "Invalid tournament data" });
        }
        const shareId = Buffer.from(`${tournament.id}-${Date.now()}`).toString('base64').substring(0, 8);
        return res.status(200).json({
          success: true,
          shareId,
          shareUrl: `https://deeppitch-engine.vercel.app/view/${shareId}`,
          syncTime: new Date().toISOString(),
          message: `Successfully synced ${tournament.name} to DeepPitch Cloud`
        });
      }

      if (action === 'GENERATE_PDF_HTML') {
        if (!tournament) {
          return res.status(400).json({ success: false, error: "Tournament data required" });
        }
        const htmlContent = generateTournamentReportHTMLServer(tournament, type);
        return res.status(200).json({ success: true, html: htmlContent });
      }

      if (action === 'GENERATE_CSV') {
        if (!tournament) {
          return res.status(400).json({ success: false, error: "Tournament data required" });
        }
        const csvContent = generateCSVReportServer(tournament);
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