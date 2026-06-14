import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, 
  Modal, Alert, StatusBar, Dimensions, Share 
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Icons from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

const { width } = Dimensions.get('window');

const COLORS = {
  bg: '#050505', card: '#121212', primary: '#00FF66', 
  secondary: '#1A1A1A', text: '#FFFFFF', muted: '#A0A0A0',
  border: '#222222', danger: '#FF4444', accent: '#00A3FF',
  gold: '#FFD700'
};

export default function App() {
  const [screen, setScreen] = useState('HOME'); // HOME, MANAGE
  const [activeTab, setActiveTab] = useState('FIXTURES'); // FIXTURES, STANDINGS, STATS, BRACKET
  const [tournaments, setTournaments] = useState([]);
  const [activeID, setActiveID] = useState(null);
  const [modal, setModal] = useState(false);
  const [matchModal, setMatchModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [teamModal, setTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const standingsRef = useRef();
  const bracketRef = useRef();

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState('LEAGUE'); // LEAGUE, KNOCKOUT, HOME_AWAY, GROUPS
  const [teamsRaw, setTeamsRaw] = useState('');
  const [teamsPerGroup, setTeamsPerGroup] = useState('4');
  const [qualifiersCount, setQualifiersCount] = useState('2');
  const [tieBreakers, setTieBreakers] = useState(['GD', 'H2H', 'GS', 'FP']);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTournaments(prev => prev.map(t => ({
        ...t,
        matches: t.matches.map(m => {
          if (m.status === 'LIVE') return { ...m, time: (m.time || 0) + 1 };
          return m;
        })
      })));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const load = async () => {
    const data = await AsyncStorage.getItem('@DP_DATA');
    const lastActive = await AsyncStorage.getItem('@DP_ACTIVE_ID');
    if (data) setTournaments(JSON.parse(data));
    if (lastActive) {
      setActiveID(lastActive);
      setScreen('MANAGE');
    }
  };

  const deleteTournament = (id) => {
    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel" },
      { text: "Delete", onPress: async () => {
        const filtered = tournaments.filter(t => t.id !== id);
        await save(filtered);
        await AsyncStorage.removeItem('@DP_ACTIVE_ID');
        setActiveID(null);
        setScreen('HOME');
      }}
    ]);
  };

  const selectTournament = async (id) => {
    setActiveID(id);
    setScreen('MANAGE');
    await AsyncStorage.setItem('@DP_ACTIVE_ID', id);
  };

  const goHome = async () => {
    setScreen('HOME');
    setActiveID(null);
    await AsyncStorage.removeItem('@DP_ACTIVE_ID');
  };

  const shareTournament = async (t) => {
    try {
      const response = await fetch('https://deeppitch-engine.vercel.app/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament: t })
      });
      const result = await response.json();
      if (result.success) {
        Share.share({
          message: `Check out ${t.name} on DeepPitch! Standings: ${result.shareUrl}`,
          url: result.shareUrl
        });
      }
    } catch (e) {
      Share.share({
        message: `DeepPitch Tournament: ${t.name}\nTeams: ${t.teams.length}\nType: ${t.type}`,
      });
    }
  };

  const save = async (list) => {
    setTournaments(list);
    await AsyncStorage.setItem('@DP_DATA', JSON.stringify(list));
  };

  const createTournament = () => {
    const teamNames = teamsRaw.split(',').map(t => t.trim()).filter(t => t);
    
    // Validation
    if (!name) return Alert.alert("Error", "Tournament name required");
    if (type === 'GROUPS' && teamNames.length < 4) return Alert.alert("Error", "Minimum 4 teams for Group format");
    if (type !== 'GROUPS' && teamNames.length < 2) return Alert.alert("Error", "Minimum 2 teams required");

    const teams = teamNames.map(n => ({
      id: Math.random().toString(36).substr(2, 5),
      name: n,
      color: COLORS.primary,
      players: [
        { id: Math.random().toString(36).substr(2, 5), name: n + ' Player 1', number: '1' },
        { id: Math.random().toString(36).substr(2, 5), name: n + ' Player 2', number: '10' }
      ]
    }));

    const newTourney = {
      id: Date.now().toString(),
      name, type,
      teams,
      matches: generateMatches(teams, type, parseInt(teamsPerGroup), parseInt(qualifiersCount)),
      settings: { ptsWin: 3, ptsDraw: 1, ptsLoss: 0, tieBreakers },
      config: { teamsPerGroup, qualifiersCount },
      status: 'ACTIVE'
    };

    const updated = [...tournaments, newTourney];
    save(updated);
    setModal(false);
    setName(''); setTeamsRaw('');
    selectTournament(newTourney.id);
  };

  function generateMatches(teams, mode, groupSize = 4, quals = 2) {
    const generateId = () => Math.random().toString(36).substr(2, 9);
    let matches = [];
    const teamIds = teams.map(t => t.id || t.name);

    if (mode === 'LEAGUE' || mode === 'HOME_AWAY') {
      for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < teamIds.length; j++) {
          matches.push({ id: generateId(), home: teamIds[i], away: teamIds[j], hScore: '0', aScore: '0', done: false, events: [], status: 'PENDING', time: 0 });
          if (mode === 'HOME_AWAY') 
            matches.push({ id: generateId(), home: teamIds[j], away: teamIds[i], hScore: '0', aScore: '0', done: false, events: [], status: 'PENDING', time: 0 });
        }
      }
    } else if (mode === 'GROUPS') {
      const numGroups = Math.ceil(teamIds.length / groupSize);
      for (let g = 0; g < numGroups; g++) {
        const groupTeams = teamIds.slice(g * groupSize, (g + 1) * groupSize);
        const groupLabel = String.fromCharCode(65 + g);
        for (let i = 0; i < groupTeams.length; i++) {
          for (let j = i + 1; j < groupTeams.length; j++) {
            matches.push({ id: generateId(), group: groupLabel, home: groupTeams[i], away: groupTeams[j], hScore: '0', aScore: '0', done: false, events: [], status: 'PENDING', time: 0 });
          }
        }
      }
    } else {
      // KNOCKOUT Logic
      const participantCount = teamIds.length;
      const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(participantCount)));
      const byes = nextPowerOfTwo - participantCount;
      let roundTeams = [...teamIds];
      for(let i=0; i<byes; i++) roundTeams.push('BYE');
      
      for (let i = 0; i < roundTeams.length; i += 2) {
        const home = roundTeams[i], away = roundTeams[i+1];
        const isBye = away === 'BYE';
        matches.push({ 
          id: generateId(), round: 1, roundIdx: i / 2,
          home, away, hScore: isBye ? '1' : '0', aScore: isBye ? '0' : '0', 
          done: isBye, winner: isBye ? home : null, events: [], status: isBye ? 'DONE' : 'PENDING', time: 0
        });
      }
    }
    return matches;
  }

  const getTN = (id) => {
    if (id === 'BYE') return 'BYE';
    if (id === '?') return '?';
    const t = activeT?.teams.find(t => t.id === id);
    return t ? t.name : id;
  };

  const getTC = (id) => {
    const t = activeT?.teams.find(t => t.id === id);
    return t ? t.color : COLORS.primary;
  };

  const updateTeam = (team) => {
    const updated = tournaments.map(t => {
      if (t.id === activeID) {
        t.teams = t.teams.map(tm => tm.id === team.id ? team : tm);
      }
      return t;
    });
    save(updated);
  };

  const updateMatch = (tId, mId, hS, aS, events = null, statusOverride = null, extraData = {}) => {
    let updatedMatchObj = null;
    const updated = tournaments.map(t => {
      if (t.id === tId) {
        let newMatches = t.matches.map(m => {
          if (m.id === mId) {
            let finalHS = hS;
            let finalAS = aS;
            const finalEvents = events || m.events || [];
            
            if (finalEvents.length > 0 && hS === '' && aS === '') {
              finalHS = finalEvents.filter(e => e.type === 'GOAL' && e.teamId === m.home).length.toString();
              finalAS = finalEvents.filter(e => e.type === 'GOAL' && e.teamId === m.away).length.toString();
            }

            const currentStatus = statusOverride || m.status;
            const done = currentStatus === 'DONE' || (finalHS !== '' && finalAS !== '');
            
            let winner = null;
            if (done) {
              const hsVal = parseInt(finalHS) || 0, asVal = parseInt(finalAS) || 0;
              winner = hsVal > asVal ? m.home : (asVal > hsVal ? m.away : 'DRAW');
            }
            updatedMatchObj = { ...m, ...extraData, hScore: finalHS, aScore: finalAS, done, winner, events: finalEvents, status: currentStatus };
            return updatedMatchObj;
          }
          return m;
        });

        // Auto-advance Knockouts
        if (t.type === 'KNOCKOUT' || (t.type === 'GROUPS' && newMatches.some(m => m.round))) {
          const currentMatch = newMatches.find(m => m.id === mId);
          if (currentMatch && currentMatch.done && currentMatch.winner && currentMatch.winner !== 'DRAW') {
            const roundMatches = newMatches.filter(m => m.round === currentMatch.round);
            const matchInRoundIndex = currentMatch.roundIdx;
            const nextRound = (currentMatch.round || 0) + 1;
            const nextMatchInRoundIndex = Math.floor(matchInRoundIndex / 2);
            let nextMatch = newMatches.find(m => m.round === nextRound && m.roundIdx === nextMatchInRoundIndex);
            
            if (!nextMatch && roundMatches.length > 1) {
              nextMatch = { id: Math.random().toString(36).substr(2, 9), round: nextRound, roundIdx: nextMatchInRoundIndex, home: '?', away: '?', hScore: '', aScore: '', done: false, events: [], status: 'PENDING', time: 0 };
              newMatches.push(nextMatch);
            }
            if (nextMatch) {
              if (matchInRoundIndex % 2 === 0) nextMatch.home = currentMatch.winner;
              else nextMatch.away = currentMatch.winner;
            }
          }
        }
        
        // Transition Group to Knockout
        if (t.type === 'GROUPS' && !newMatches.some(m => m.round)) {
          const allGroupMatchesDone = newMatches.filter(m => m.group).every(m => m.done);
          if (allGroupMatchesDone) {
            const qualifiedIds = [];
            const groups = [...new Set(newMatches.filter(m => m.group).map(m => m.group))];
            groups.forEach(g => {
              const groupStats = getStats({...t, matches: newMatches.filter(m => m.group === g)});
              qualifiedIds.push(...groupStats.slice(0, t.config.qualifiersCount).map(s => s[0]));
            });
            const knockoutMatches = generateMatches(qualifiedIds.map(id => ({id})), 'KNOCKOUT');
            newMatches.push(...knockoutMatches.map(m => ({...m, round: 1})));
          }
        }
        return { ...t, matches: newMatches };
      }
      return t;
    });
    if (updatedMatchObj) setSelectedMatch(updatedMatchObj);
    save(updated);
  };

  const getStats = (t) => {
    if (!t || !t.teams) return [];
    let stats = {};
    t.teams.forEach(tm => stats[tm.id] = { id: tm.id, p: 0, w: 0, d: 0, l: 0, pts: 0, gd: 0, gs: 0, fp: 0 });
    
    t.matches.forEach(m => {
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

        if (hs > as) { h.w++; a.l++; h.pts += t.settings.ptsWin; }
        else if (as > hs) { a.w++; h.l++; a.pts += t.settings.ptsWin; }
        else { h.d++; a.d++; h.pts += t.settings.ptsDraw; a.pts += t.settings.ptsDraw; }
      }
    });

    const tb = t.settings.tieBreakers || ['GD', 'H2H', 'GS', 'FP'];

    return Object.entries(stats).sort((a_entry, b_entry) => {
      const a = a_entry[1], b = b_entry[1];
      if (b.pts !== a.pts) return b.pts - a.pts;
      
      for (let rule of tb) {
        if (rule === 'GD' && b.gd !== a.gd) return b.gd - a.gd;
        if (rule === 'GS' && b.gs !== a.gs) return b.gs - a.gs;
        if (rule === 'FP' && b.fp !== a.fp) return b.fp - a.fp;
        if (rule === 'H2H') {
          const h2h = t.matches.filter(m => m.done && ((m.home === a.id && m.away === b.id) || (m.home === b.id && m.away === a.id)));
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

  const getPlayerStats = (t) => {
    if (!t || !t.matches) return { scorers: [], assisters: [], cards: [] };
    const scorers = {};
    const assisters = {};
    const cards = {};
    t.matches.forEach(m => {
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

  const activeT = tournaments.find(t => t.id === activeID) || null;
  const { scorers, assisters, cards } = getPlayerStats(activeT);

  const exportAsImage = async (ref, fileName) => {
    try {
      const uri = await captureRef(ref, {
        format: 'png',
        quality: 1,
        result: 'tmpfile'
      });
      await Sharing.shareAsync(uri, { dialogTitle: `Share ${fileName}` });
    } catch (e) {
      Alert.alert("Export Error", "Failed to generate image");
    }
  };

  const exportAsPDF = async (type) => {
    if (!activeT) return;
    
    let htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica', sans-serif; padding: 20px; background: #050505; color: #fff; }
            h1 { color: #00FF66; text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border-bottom: 1px solid #222; padding: 12px; text-align: center; }
            th { color: #00FF66; text-transform: uppercase; font-size: 12px; }
            .team-name { text-align: left; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>${activeT.name} - ${type} Report</h1>
          ${type === 'STANDINGS' ? renderStandingsHTML() : renderFixturesHTML()}
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e) {
      Alert.alert("Export Error", "Failed to generate PDF");
    }
  };

  const renderStandingsHTML = () => {
    const stats = getStats(activeT);
    return `
      <table>
        <tr><th style="text-align:left">TEAM</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>PTS</th></tr>
        ${stats.map(([id, s]) => `
          <tr>
            <td class="team-name">${getTN(id)}</td>
            <td>${s.p}</td><td>${s.w}</td><td>${s.d}</td><td>${s.l}</td><td>${s.gd}</td><td>${s.pts}</td>
          </tr>
        `).join('')}
      </table>
    `;
  };

  const renderFixturesHTML = () => {
    return `
      <table>
        <tr><th style="text-align:left">MATCH</th><th>RESULT</th></tr>
        ${activeT.matches.map(m => `
          <tr>
            <td class="team-name">${getTN(m.home)} vs ${getTN(m.away)}</td>
            <td>${m.done ? `${m.hScore} - ${m.aScore}` : 'PENDING'}</td>
          </tr>
        `).join('')}
      </table>
    `;
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        {screen === 'MANAGE' ? (
          <TouchableOpacity onPress={goHome}><Icons.ChevronLeft color="#fff" /></TouchableOpacity>
        ) : (
          <View style={{width: 24}} />
        )}
        <Text style={styles.logo}>DEEP<Text style={{color: COLORS.primary}}>PITCH</Text></Text>
        <View style={{flexDirection: 'row', gap: 15, alignItems: 'center'}}>
          {screen === 'MANAGE' && (
            <>
              <TouchableOpacity onPress={() => shareTournament(activeT)}><Icons.Share2 color={COLORS.accent} size={20} /></TouchableOpacity>
              <TouchableOpacity onPress={() => deleteTournament(activeID)}><Icons.Trash2 color={COLORS.danger} size={20} /></TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={() => setModal(true)}><Icons.PlusCircle color={COLORS.primary} /></TouchableOpacity>
        </View>
      </View>

      {screen === 'HOME' ? (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.label}>Active Tournaments</Text>
          {tournaments.map(t => (
            <TouchableOpacity key={t.id} style={styles.tCard} onPress={() => selectTournament(t.id)}>
              <View>
                <Text style={styles.tName}>{t.name}</Text>
                <Text style={styles.tSub}>{t.type.replace('_', ' ')} • {t.teams.length} Teams</Text>
              </View>
              <Icons.ChevronRight color={COLORS.muted} />
            </TouchableOpacity>
          ))}
          {tournaments.length === 0 && (
            <View style={{padding: 40, alignItems: 'center'}}>
              <Icons.Trophy color={COLORS.border} size={48} />
              <Text style={{color: COLORS.muted, marginTop: 10}}>Start your first tournament</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        activeT ? (
          <View style={{flex: 1}}>
            <View style={styles.tabBar}>
              {['FIXTURES', 'STANDINGS', 'TEAMS', 'STATS', 'BRACKET'].map(tab => {
                if (tab === 'BRACKET' && activeT.type === 'LEAGUE' && !activeT.matches.some(m => m.round)) return null;
                if (tab === 'BRACKET' && activeT.type === 'HOME_AWAY') return null;
                return (
                  <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && styles.activeTab]}>
                    <Text style={[styles.tabText, activeTab === tab && {color: COLORS.primary}]}>{tab}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView style={{ flex: 1, padding: 15 }}>
              {activeTab === 'STANDINGS' && (
                <View collapsable={false} ref={standingsRef}>
                  <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginBottom: 10}}>
                    <TouchableOpacity onPress={() => exportAsPDF('STANDINGS')} style={styles.miniBtn}>
                      <Icons.FileText color={COLORS.accent} size={14} />
                      <Text style={styles.miniBtnText}>PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => exportAsImage(standingsRef, 'Standings')} style={styles.miniBtn}>
                      <Icons.Image color={COLORS.primary} size={14} />
                      <Text style={styles.miniBtnText}>IMAGE</Text>
                    </TouchableOpacity>
                  </View>
                  {activeT.type === 'GROUPS' ? (
                    [...new Set(activeT.matches.filter(m => m.group).map(m => m.group))].map(g => (
                      <View key={g} style={{marginBottom: 20}}>
                        <Text style={styles.label}>Group {g}</Text>
                        <StandingsTable data={getStats({...activeT, matches: activeT.matches.filter(m => m.group === g)})} resolveName={getTN} />
                      </View>
                    ))
                  ) : (
                    <StandingsTable data={getStats(activeT)} resolveName={getTN} />
                  )}
                </View>
              )}

              {activeTab === 'FIXTURES' && (
                activeT.matches.map(m => (
                  <View key={m.id} style={[styles.match, m.away === 'BYE' && {opacity: 0.5}]}>
                    <View style={{flex: 1}}>
                      {m.group && <Text style={styles.mTag}>GROUP {m.group}</Text>}
                      {m.round && <Text style={[styles.mTag, {color: COLORS.gold}]}>ROUND {m.round}</Text>}
                      <Text style={[styles.mTeam, {color: getTC(m.home)}]}>{getTN(m.home)}</Text>
                    </View>
                    {m.away !== 'BYE' ? (
                      <View style={{alignItems: 'center', minWidth: 80}}>
                        {m.status === 'LIVE' && (
                          <Text style={{color: COLORS.primary, fontSize: 10, fontWeight: 'bold', marginBottom: 2}}>
                            {Math.floor(m.time / 60)}' {m.addedTime ? `+${m.addedTime}` : ''}
                          </Text>
                        )}
                        <TouchableOpacity 
                          style={[styles.manageBtn, m.done && {borderColor: COLORS.primary}, m.status === 'LIVE' && {borderColor: COLORS.danger}]} 
                          onPress={() => { setSelectedMatch(m); setMatchModal(true); }}
                        >
                          <Text style={[styles.manageBtnText, m.done && {color: COLORS.primary}, m.status === 'LIVE' && {color: COLORS.danger}]}>
                            {m.done ? `${m.hScore} - ${m.aScore}` : (m.status === 'LIVE' ? `${m.hScore} - ${m.aScore}` : 'MANAGE')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={{color: COLORS.muted, fontSize: 10, flex: 0.5, textAlign: 'center'}}>BYE</Text>
                    )}
                    <Text style={[styles.mTeam, {textAlign: 'right', flex: 1, color: getTC(m.away)}]}>{getTN(m.away)}</Text>
                  </View>
                ))
              )}

              {activeTab === 'TEAMS' && (
                <View style={{gap: 10}}>
                  {activeT.teams.map(team => (
                    <TouchableOpacity key={team.id} style={styles.tCard} onPress={() => { setEditingTeam({...team}); setTeamModal(true); }}>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                        <View style={{width: 4, height: 30, backgroundColor: team.color || COLORS.primary, borderRadius: 2}} />
                        <View>
                          <Text style={styles.tName}>{team.name}</Text>
                          <Text style={styles.tSub}>{team.players.length} Players</Text>
                        </View>
                      </View>
                      <Icons.Settings2 color={COLORS.muted} size={18} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {activeTab === 'STATS' && (
                <View style={{gap: 20}}>
                  <View>
                    <Text style={styles.label}>Top Scorers</Text>
                    {scorers.map(([name, count], i) => (
                      <View key={i} style={styles.statRow}><Text style={styles.statName}>{name}</Text><Text style={styles.statVal}>{count} G</Text></View>
                    ))}
                  </View>
                  <View>
                    <Text style={styles.label}>Top Assisters</Text>
                    {assisters.map(([name, count], i) => (
                      <View key={i} style={styles.statRow}><Text style={styles.statName}>{name}</Text><Text style={[styles.statVal, {color: COLORS.accent}]}>{count} A</Text></View>
                    ))}
                  </View>
                  <View>
                    <Text style={styles.label}>Cards Summary</Text>
                    {cards.map(([name, count], i) => (
                      <View key={i} style={styles.statRow}><Text style={styles.statName}>{name}</Text><Text style={[styles.statVal, {color: COLORS.danger}]}>{count} C</Text></View>
                    ))}
                  </View>
                </View>
              )}

              {activeTab === 'BRACKET' && (
                <View>
                  <View style={{flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginBottom: 10}}>
                    <TouchableOpacity onPress={() => exportAsImage(bracketRef, 'Bracket')} style={styles.miniBtn}>
                      <Icons.Image color={COLORS.primary} size={14} />
                      <Text style={styles.miniBtnText}>EXPORT BRACKET IMAGE</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                    <View collapsable={false} ref={bracketRef} style={{flexDirection: 'row', backgroundColor: COLORS.bg, padding: 10}}>
                  {(() => {
                    const knockoutMatches = activeT.matches.filter(m => m.round).sort((a, b) => a.round - b.round || a.roundIdx - b.roundIdx);
                    const maxRound = knockoutMatches.length > 0 ? Math.max(...knockoutMatches.map(m => m.round)) : 0;
                    const rounds = [];
                    for(let r = 1; r <= maxRound; r++) {
                      rounds.push(knockoutMatches.filter(m => m.round === r));
                    }
                    
                    return rounds.map((roundMatches, rIdx) => {
                      const roundNum = rIdx + 1;
                      let roundName = `ROUND ${roundNum}`;
                      if (roundNum === maxRound) roundName = "FINAL";
                      else if (roundNum === maxRound - 1) roundName = "SEMI-FINALS";
                      else if (roundNum === maxRound - 2) roundName = "QUARTER-FINALS";

                      return (
                        <View key={roundNum} style={{ width: 220, marginRight: 20 }}>
                          <Text style={[styles.label, { textAlign: 'center', color: COLORS.gold }]}>{roundName}</Text>
                          <View style={{ flex: 1, justifyContent: 'space-around' }}>
                            {roundMatches.map(m => (
                              <TouchableOpacity 
                                key={m.id} 
                                style={[styles.bracketNode, m.done && { borderColor: COLORS.primary }]}
                                onPress={() => { setSelectedMatch(m); setMatchModal(true); }}
                              >
                                <View style={styles.bracketTeam}>
                                  <Text numberOfLines={1} style={[styles.bracketTeamText, m.winner === m.home && { color: COLORS.primary }]}>{getTN(m.home)}</Text>
                                  <Text style={styles.bracketScore}>{m.hScore}</Text>
                                </View>
                                <View style={[styles.bracketTeam, { borderTopWidth: 1, borderColor: COLORS.border }]}>
                                  <Text numberOfLines={1} style={[styles.bracketTeamText, m.winner === m.away && { color: COLORS.primary }]}>{getTN(m.away)}</Text>
                                  <Text style={styles.bracketScore}>{m.aScore}</Text>
                                </View>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      );
                    });
                  })()}
                    </View>
                  </ScrollView>
                </View>
              )}
              <View style={{height: 80}} />
            </ScrollView>
          </View>
        ) : null
      )}

      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Tournament</Text>
            <TextInput style={styles.input} placeholder="Tournament Name" placeholderTextColor="#666" value={name} onChangeText={setName} />
            <View style={styles.typeRow}>
              {['LEAGUE', 'KNOCKOUT', 'GROUPS'].map(m => (
                <TouchableOpacity key={m} style={[styles.typeBtn, type === m && {borderColor: COLORS.primary, borderWidth: 1}]} onPress={() => setType(m)}>
                  <Text style={{color: type === m ? COLORS.primary : '#fff', fontSize: 10, fontWeight: 'bold'}}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {type === 'GROUPS' && (
              <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                <TextInput style={[styles.input, {flex: 1}]} placeholder="Teams/Group" keyboardType="numeric" value={teamsPerGroup} onChangeText={setTeamsPerGroup} />
                <TextInput style={[styles.input, {flex: 1}]} placeholder="Qualifiers" keyboardType="numeric" value={qualifiersCount} onChangeText={setQualifiersCount} />
              </View>
            )}
            {(type === 'LEAGUE' || type === 'GROUPS') && (
              <View style={{marginBottom: 15}}>
                <Text style={[styles.label, {fontSize: 10}]}>Tie-Breaker Priority (Tap to Cycle)</Text>
                <View style={{flexDirection: 'row', gap: 5}}>
                  {tieBreakers.map((tb, idx) => (
                    <TouchableOpacity key={tb} style={[styles.typeBtn, {backgroundColor: COLORS.secondary}]} onPress={() => {
                      const next = [...tieBreakers];
                      const item = next.splice(idx, 1)[0];
                      next.push(item);
                      setTieBreakers(next);
                    }}>
                      <Text style={{color: COLORS.primary, fontSize: 10, fontWeight: 'bold'}}>{idx + 1}. {tb}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <TextInput style={[styles.input, {height: 80}]} multiline placeholder="Teams (comma separated)" placeholderTextColor="#666" value={teamsRaw} onChangeText={setTeamsRaw} />
            <TouchableOpacity style={styles.btn} onPress={createTournament}><Text style={styles.btnText}>GENERATE BRACKET</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setModal(false)}><Text style={{color: COLORS.danger, textAlign: 'center', marginTop: 15}}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={teamModal} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={[styles.modalContent, {maxHeight: '85%'}]}>
            {editingTeam && activeT && (
              <ScrollView>
                <Text style={styles.modalTitle}>Edit {editingTeam.name}</Text>
                
                <Text style={styles.label}>Team Details</Text>
                <TextInput 
                  style={styles.input} 
                  value={editingTeam.name} 
                  onChangeText={t => setEditingTeam({...editingTeam, name: t})} 
                  placeholder="Team Name"
                />
                <View style={{flexDirection: 'row', gap: 10, marginBottom: 20}}>
                  {['#00FF66', '#00A3FF', '#FF4444', '#FFCC00', '#FFFFFF'].map(c => (
                    <TouchableOpacity 
                      key={c} 
                      onPress={() => setEditingTeam({...editingTeam, color: c})}
                      style={{width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: editingTeam.color === c ? 2 : 0, borderColor: '#fff'}} 
                    />
                  ))}
                </View>

                <Text style={styles.label}>Roster</Text>
                {editingTeam.players.map((p, idx) => (
                  <View key={p.id} style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
                    <TextInput 
                      style={[styles.input, {flex: 1, marginBottom: 0}]} 
                      value={p.name} 
                      onChangeText={val => {
                        const newPlayers = [...editingTeam.players];
                        newPlayers[idx].name = val;
                        setEditingTeam({...editingTeam, players: newPlayers});
                      }}
                    />
                    <TextInput 
                      style={[styles.input, {width: 50, marginBottom: 0, textAlign: 'center'}]} 
                      value={p.number} 
                      keyboardType="numeric"
                      onChangeText={val => {
                        const newPlayers = [...editingTeam.players];
                        newPlayers[idx].number = val;
                        setEditingTeam({...editingTeam, players: newPlayers});
                      }}
                    />
                    <TouchableOpacity 
                      style={{justifyContent: 'center', paddingHorizontal: 5}} 
                      onPress={() => {
                        const newPlayers = editingTeam.players.filter((_, i) => i !== idx);
                        setEditingTeam({...editingTeam, players: newPlayers});
                      }}
                    >
                      <Icons.Trash2 color={COLORS.danger} size={18} />
                    </TouchableOpacity>
                  </View>
                ))}
                
                <TouchableOpacity 
                  style={[styles.btn, {backgroundColor: COLORS.secondary, marginTop: 10}]} 
                  onPress={() => {
                    const newPlayer = { id: Math.random().toString(36).substr(2, 5), name: 'New Player', number: '' };
                    setEditingTeam({...editingTeam, players: [...editingTeam.players, newPlayer]});
                  }}
                >
                  <Text style={[styles.btnText, {color: COLORS.primary}]}>+ ADD PLAYER</Text>
                </TouchableOpacity>

                <View style={{flexDirection: 'row', gap: 10, marginTop: 30}}>
                  <TouchableOpacity style={[styles.btn, {flex: 1, backgroundColor: COLORS.muted}]} onPress={() => setTeamModal(false)}>
                    <Text style={styles.btnText}>CANCEL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, {flex: 1}]} onPress={() => { updateTeam(editingTeam); setTeamModal(false); }}>
                    <Text style={styles.btnText}>SAVE CHANGES</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={matchModal} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={[styles.modalContent, {maxHeight: '85%'}]}>
            {selectedMatch && activeT && (
              <>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                  <Text style={[styles.modalTitle, {marginBottom: 0}]}>{getTN(selectedMatch.home)} vs {getTN(selectedMatch.away)}</Text>
                  {selectedMatch.status !== 'DONE' && (
                    <View style={{alignItems: 'flex-end'}}>
                      <Text style={{color: COLORS.primary, fontWeight: 'bold'}}>{Math.floor((selectedMatch.time || 0) / 60)}:{(selectedMatch.time || 0) % 60 < 10 ? '0' : ''}{(selectedMatch.time || 0) % 60}</Text>
                      <Text style={{color: COLORS.muted, fontSize: 9}}>{selectedMatch.status}</Text>
                    </View>
                  )}
                </View>

                <View style={{flexDirection: 'row', gap: 5, marginBottom: 20}}>
                  {selectedMatch.status === 'PENDING' && (
                    <TouchableOpacity style={[styles.typeBtn, {backgroundColor: COLORS.primary}]} onPress={() => updateMatch(activeT.id, selectedMatch.id, '0', '0', [], 'LIVE')}>
                      <Text style={{color: '#000', fontSize: 10, fontWeight: 'bold'}}>START MATCH</Text>
                    </TouchableOpacity>
                  )}
                  {selectedMatch.status === 'LIVE' && (
                    <>
                      <TouchableOpacity style={[styles.typeBtn, {backgroundColor: COLORS.accent}]} onPress={() => updateMatch(activeT.id, selectedMatch.id, '', '', null, 'HALFTIME')}>
                        <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>HALF TIME</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.typeBtn, {backgroundColor: COLORS.danger}]} onPress={() => updateMatch(activeT.id, selectedMatch.id, '', '', null, 'DONE')}>
                        <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>FULL TIME</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {selectedMatch.status === 'HALFTIME' && (
                    <TouchableOpacity style={[styles.typeBtn, {backgroundColor: COLORS.primary}]} onPress={() => updateMatch(activeT.id, selectedMatch.id, '', '', null, 'LIVE')}>
                      <Text style={{color: '#000', fontSize: 10, fontWeight: 'bold'}}>RESUME</Text>
                    </TouchableOpacity>
                  )}
                  {selectedMatch.status !== 'DONE' && (
                    <TouchableOpacity 
                      style={styles.typeBtn} 
                      onPress={() => updateMatch(activeT.id, selectedMatch.id, selectedMatch.hScore, selectedMatch.aScore, null, null, { addedTime: (selectedMatch.addedTime || 0) + 1 })}
                    >
                      <Text style={{color: '#fff', fontSize: 10, fontWeight: 'bold'}}>+1 MIN</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView>
                  <Text style={styles.label}>Match Events</Text>
                  {(selectedMatch.events || []).map((ev, i) => (
                    <View key={i} style={styles.eventRow}>
                      <Text style={{color: '#fff', fontSize: 12, flex: 1}}>{ev.type} - {ev.player} ({getTN(ev.teamId)})</Text>
                      <TouchableOpacity onPress={() => {
                        const newEvents = selectedMatch.events.filter((_, idx) => idx !== i);
                        updateMatch(activeT.id, selectedMatch.id, '', '', newEvents);
                      }}>
                        <Icons.X color={COLORS.danger} size={14} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  
                  <View style={{marginTop: 20, gap: 10}}>
                    {[selectedMatch.home, selectedMatch.away].map(teamId => (
                      <View key={teamId}>
                        <Text style={{color: COLORS.muted, fontSize: 10, fontWeight: 'bold'}}>{getTN(teamId)?.toUpperCase()} ACTIONS</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexDirection: 'row', marginTop: 5}}>
                          {activeT.teams.find(t => t.id === teamId)?.players.map(p => (
                            <View key={p.id} style={{marginRight: 10, gap: 5}}>
                              <Text style={{color: '#fff', fontSize: 10}}>{p.number}. {p.name}</Text>
                              <View style={{flexDirection: 'row', gap: 5}}>
                                <TouchableOpacity style={styles.actionBtn} onPress={() => {
                                  const ev = { type: 'GOAL', player: p.name, teamId, id: Date.now() };
                                  const newEvents = [...(selectedMatch.events || []), ev];
                                  setSelectedMatch({ ...selectedMatch, events: newEvents });
                                  updateMatch(activeT.id, selectedMatch.id, '', '', newEvents);
                                }}><Icons.Zap color={COLORS.primary} size={12} /></TouchableOpacity>
                                <TouchableOpacity style={[styles.actionBtn, {borderColor: '#FFCC00'}]} onPress={() => {
                                  const ev = { type: 'YELLOW', player: p.name, teamId, id: Date.now() };
                                  const newEvents = [...(selectedMatch.events || []), ev];
                                  setSelectedMatch({ ...selectedMatch, events: newEvents });
                                  updateMatch(activeT.id, selectedMatch.id, '', '', newEvents);
                                }}><Icons.Square color="#FFCC00" size={12} fill="#FFCC00" /></TouchableOpacity>
                                <TouchableOpacity style={[styles.actionBtn, {borderColor: COLORS.danger}]} onPress={() => {
                                  const ev = { type: 'RED', player: p.name, teamId, id: Date.now() };
                                  const newEvents = [...(selectedMatch.events || []), ev];
                                  setSelectedMatch({ ...selectedMatch, events: newEvents });
                                  updateMatch(activeT.id, selectedMatch.id, '', '', newEvents);
                                }}><Icons.Square color={COLORS.danger} size={12} fill={COLORS.danger} /></TouchableOpacity>
                                <TouchableOpacity style={[styles.actionBtn, {borderColor: COLORS.accent}]} onPress={() => {
                                  const ev = { type: 'ASSIST', player: p.name, teamId, id: Date.now() };
                                  const newEvents = [...(selectedMatch.events || []), ev];
                                  setSelectedMatch({ ...selectedMatch, events: newEvents });
                                  updateMatch(activeT.id, selectedMatch.id, '', '', newEvents);
                                }}><Icons.Users color={COLORS.accent} size={12} /></TouchableOpacity>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                
                <TouchableOpacity style={[styles.btn, {marginTop: 20}]} onPress={() => setMatchModal(false)}>
                  <Text style={styles.btnText}>DONE</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const StandingsTable = ({ data, resolveName }) => (
  <View style={styles.table}>
    <View style={styles.row}><Text style={[styles.cell, {flex: 2, textAlign: 'left'}]}>TEAM</Text><Text style={styles.cell}>P</Text><Text style={styles.cell}>GD</Text><Text style={styles.cell}>PTS</Text></View>
    {data.map(([id, s], i) => (
      <View key={i} style={[styles.row, {borderTopWidth: 1, borderColor: '#222'}]}>
        <Text style={[styles.cell, {flex: 2, textAlign: 'left', color: i < 2 ? COLORS.primary : '#fff'}]}>{resolveName ? resolveName(id) : id}</Text>
        <Text style={styles.cell}>{s.p}</Text><Text style={styles.cell}>{s.gd}</Text><Text style={styles.cell}>{s.pts}</Text>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  logo: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -1 },
  label: { color: COLORS.primary, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase', fontSize: 12 },
  tCard: { backgroundColor: COLORS.card, padding: 20, borderRadius: 15, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  tName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  tSub: { color: COLORS.muted, fontSize: 12 },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: COLORS.card, padding: 25, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  input: { backgroundColor: COLORS.secondary, color: '#fff', padding: 15, borderRadius: 10, marginBottom: 15 },
  typeRow: { flexDirection: 'row', gap: 5, marginBottom: 15 },
  typeBtn: { flex: 1, padding: 10, borderRadius: 5, backgroundColor: COLORS.secondary, alignItems: 'center' },
  btn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 10, alignItems: 'center' },
  btnText: { fontWeight: '900', color: '#000' },
  table: { backgroundColor: COLORS.card, borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', padding: 12 },
  cell: { color: '#fff', flex: 1, textAlign: 'center', fontSize: 12 },
  match: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 15, borderRadius: 10, marginBottom: 8, gap: 10 },
  mTeam: { color: '#fff', flex: 1, fontSize: 13, fontWeight: '600' },
  mInput: { backgroundColor: COLORS.secondary, color: COLORS.primary, width: 40, height: 40, textAlign: 'center', borderRadius: 8, fontWeight: 'bold', fontSize: 16 },
  mTag: { fontSize: 8, color: COLORS.muted, fontWeight: '900', marginBottom: 2 },
  tabBar: { flexDirection: 'row', paddingHorizontal: 15, borderBottomWidth: 1, borderColor: COLORS.border },
  tab: { paddingVertical: 15, marginRight: 20, borderBottomWidth: 2, borderColor: 'transparent' },
  activeTab: { borderColor: COLORS.primary },
  tabText: { color: COLORS.muted, fontWeight: 'bold', fontSize: 12 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: COLORS.card, borderRadius: 8, marginBottom: 5 },
  statName: { color: '#fff', fontWeight: '500' },
  statVal: { color: COLORS.primary, fontWeight: 'bold' },
  manageBtn: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, minWidth: 60, alignItems: 'center' },
  manageBtnText: { color: COLORS.muted, fontSize: 12, fontWeight: 'bold' },
  eventRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondary, padding: 8, borderRadius: 6, marginBottom: 5 },
  actionBtn: { width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  bracketNode: { backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, marginVertical: 10, overflow: 'hidden' },
  bracketTeam: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, height: 40 },
  bracketTeamText: { color: '#fff', fontSize: 11, fontWeight: '600', flex: 1 },
  bracketScore: { color: COLORS.gold, fontWeight: 'bold', fontSize: 12, marginLeft: 5, width: 20, textAlign: 'right' },
  miniBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondary, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, gap: 5, borderWidth: 1, borderColor: COLORS.border },
  miniBtnText: { color: '#fff', fontSize: 10, fontWeight: 'bold' }
});