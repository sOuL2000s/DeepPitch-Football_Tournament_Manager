const COLORS = {
  bg: '#050505', card: '#121212', primary: '#00FF66',
  secondary: '#1A1A1A', text: '#FFFFFF', muted: '#A0A0A0',
  border: '#222222', danger: '#FF4444', accent: '#00A3FF',
  gold: '#FFD700'
};

const escapeHtml = (unsafe) => {
  if (!unsafe || typeof unsafe !== 'string') return unsafe;
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const getTN = (id, tournament) => {
  if (id === 'BYE') return 'BYE';
  if (id === '?') return '?';
  const t = tournament?.teams.find(team => team.id === id);
  return String(t ? t.name : id);
};

const getTC = (id, tournament) => {
  const t = tournament?.teams.find(team => team.id === id);
  return t ? t.color : '#00FF66';
};

const getStats = (tournament) => {
  if (!tournament || !tournament.teams || !tournament.matches) return [];
  let stats = {};
  const uniqueTeamIdsInMatches = new Set();
  tournament.matches.forEach(m => {
      if (m.home !== 'BYE') uniqueTeamIdsInMatches.add(m.home);
      if (m.away !== 'BYE') uniqueTeamIdsInMatches.add(m.away);
  });
  tournament.teams.forEach(tm => {
      if (uniqueTeamIdsInMatches.has(tm.id)) {
          stats[tm.id] = { id: tm.id, p: 0, w: 0, d: 0, l: 0, pts: 0, gd: 0, gs: 0, gf: 0, ga: 0, fp: 0 };
      }
  });
  tournament.matches.forEach(m => {
    if (m.done && m.away !== 'BYE' && stats[m.home] && stats[m.away]) {
      const hs = parseInt(m.hScore) || 0, as = parseInt(m.aScore) || 0;
      const h = stats[m.home], a = stats[m.away];
      h.p++; a.p++;
      h.gs += hs; a.gs += as;
      h.gf += hs; h.ga += as;
      h.gd += (hs - as); 
      a.gf += as; a.ga += hs;
      a.gd += (as - hs);
      (m.events || []).forEach(e => {
        if (e.type === 'YELLOW') { if (e.teamId === m.home) h.fp -= 1; else a.fp -= 1; }
        if (e.type === 'RED') { if (e.teamId === m.home) h.fp -= 3; else a.fp -= 3; }
      });
      if (hs > as) { h.w++; a.l++; h.pts += (tournament.settings?.ptsWin || 3); }
      else if (as > hs) { a.w++; h.l++; a.pts += (tournament.settings?.ptsWin || 3); }
      else { h.d++; a.d++; h.pts += (tournament.settings?.ptsDraw || 1); a.pts += (tournament.settings?.ptsDraw || 1); }
    }
  });
  const tb = tournament.settings?.tieBreakers || ['GD', 'H2H', 'GS', 'FP'];
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

const getPlayerStats = (tournament) => {
  if (!tournament || !tournament.matches) return { scorers: [], assisters: [], cards: [] };
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

module.exports = { COLORS, escapeHtml, getTN, getTC, getStats, getPlayerStats };