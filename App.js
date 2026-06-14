import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, 
  Modal, Alert, SafeAreaView, StatusBar, Dimensions, Share 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Icons from 'lucide-react-native';

const { width } = Dimensions.get('window');

const COLORS = {
  bg: '#050505', card: '#121212', primary: '#00FF66', 
  secondary: '#1A1A1A', text: '#FFFFFF', muted: '#A0A0A0',
  border: '#222222', danger: '#FF4444', accent: '#00A3FF'
};

export default function App() {
  const [screen, setScreen] = useState('HOME'); // HOME, MANAGE
  const [tournaments, setTournaments] = useState([]);
  const [activeID, setActiveID] = useState(null);
  const [modal, setModal] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState('LEAGUE'); // LEAGUE, KNOCKOUT, HOME_AWAY
  const [teamsRaw, setTeamsRaw] = useState('');

  useEffect(() => { load(); }, []);

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
      const response = await fetch('https://deeppitch.vercel.app/api', {
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
    const teamList = teamsRaw.split(',').map(t => t.trim()).filter(t => t);
    if (!name || teamList.length < 2) return Alert.alert("Error", "Need name and 2+ teams");

    const newTourney = {
      id: Date.now().toString(),
      name, type,
      teams: teamList.map(n => ({ id: Math.random().toString(36).substr(2, 5), name: n })),
      matches: generateMatches(teamList, type),
      settings: { ptsWin: 3, ptsDraw: 1, ptsLoss: 0 }
    };

    const updated = [...tournaments, newTourney];
    save(updated);
    setModal(false);
    setName(''); setTeamsRaw('');
    selectTournament(newTourney.id);
  };

  function generateMatches(names, mode) {
    const generateId = () => Math.random().toString(36).substr(2, 9);
    let matches = [];
    if (mode === 'LEAGUE' || mode === 'HOME_AWAY') {
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          matches.push({ id: generateId(), home: names[i], away: names[j], hScore: '', aScore: '', done: false });
          if (mode === 'HOME_AWAY') 
            matches.push({ id: generateId(), home: names[j], away: names[i], hScore: '', aScore: '', done: false });
        }
      }
    } else {
      const participantCount = names.length;
      const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(participantCount)));
      const byes = nextPowerOfTwo - participantCount;
      let roundTeams = [...names];
      for(let i=0; i<byes; i++) roundTeams.push('BYE');
      
      for (let i = 0; i < roundTeams.length; i += 2) {
        const home = roundTeams[i], away = roundTeams[i+1];
        const isBye = away === 'BYE';
        matches.push({ 
          id: generateId(), round: 1, roundIdx: i / 2,
          home, away, hScore: isBye ? '1' : '', aScore: isBye ? '0' : '', 
          done: isBye, winner: isBye ? home : null
        });
      }
    }
    return matches;
  }

  const updateMatch = (tId, mId, hS, aS) => {
    const updated = tournaments.map(t => {
      if (t.id === tId) {
        let newMatches = t.matches.map(m => {
          if (m.id === mId) {
            const done = (hS !== '' && aS !== '');
            let winner = null;
            if (done) {
              const hsVal = parseInt(hS) || 0, asVal = parseInt(aS) || 0;
              winner = hsVal > asVal ? m.home : (asVal > hsVal ? m.away : 'DRAW');
            }
            return { ...m, hScore: hS, aScore: aS, done, winner };
          }
          return m;
        });

        if (t.type === 'KNOCKOUT') {
          const matchIndex = newMatches.findIndex(m => m.id === mId);
          const currentMatch = newMatches[matchIndex];
          if (currentMatch.done && currentMatch.winner && currentMatch.winner !== 'DRAW') {
            const roundMatches = newMatches.filter(m => m.round === currentMatch.round);
            const matchInRoundIndex = roundMatches.findIndex(m => m.id === mId);
            const nextRound = currentMatch.round + 1;
            const nextMatchInRoundIndex = Math.floor(matchInRoundIndex / 2);
            let nextMatch = newMatches.find(m => m.round === nextRound && m.roundIdx === nextMatchInRoundIndex);
            
            if (!nextMatch && roundMatches.length > 1) {
              nextMatch = { id: Math.random().toString(36).substr(2, 9), round: nextRound, roundIdx: nextMatchInRoundIndex, home: '?', away: '?', hScore: '', aScore: '', done: false };
              newMatches.push(nextMatch);
            }
            if (nextMatch) {
              if (matchInRoundIndex % 2 === 0) nextMatch.home = currentMatch.winner;
              else nextMatch.away = currentMatch.winner;
            }
          }
        }
        t.matches = newMatches;
      }
      return t;
    });
    save(updated);
  };

  const getStats = (t) => {
    if (!t || t.type === 'KNOCKOUT') return [];
    let stats = {};
    t.teams.forEach(tm => stats[tm.name] = { p: 0, w: 0, d: 0, l: 0, pts: 0, gd: 0 });
    t.matches.forEach(m => {
      if (m.done && m.away !== 'BYE' && stats[m.home] && stats[m.away]) {
        const hs = parseInt(m.hScore) || 0, as = parseInt(m.aScore) || 0;
        const h = stats[m.home], a = stats[m.away];
        h.p++; a.p++; h.gd += (hs - as); a.gd += (as - hs);
        if (hs > as) { h.w++; a.l++; h.pts += t.settings.ptsWin; }
        else if (as > hs) { a.w++; h.l++; a.pts += t.settings.ptsWin; }
        else { h.d++; a.d++; h.pts += t.settings.ptsDraw; a.pts += t.settings.ptsDraw; }
      }
    });
    return Object.entries(stats).sort((a, b) => b[1].pts - a[1].pts || b[1].gd - a[1].gd);
  };

  const activeT = tournaments.find(t => t.id === activeID);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* HEADER */}
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
                <Text style={styles.tSub}>{t.type} • {t.teams.length} Teams</Text>
              </View>
              <Icons.ChevronRight color={COLORS.muted} />
            </TouchableOpacity>
          ))}
          {tournaments.length === 0 && (
            <View style={{padding: 40, alignItems: 'center'}}>
              <Icons.Trophy color={COLORS.border} size={48} />
              <Text style={{color: COLORS.muted, marginTop: 10}}>No tournaments yet</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        activeT ? (
          <ScrollView style={{ flex: 1, padding: 15 }}>
            {activeT.type !== 'KNOCKOUT' && (
              <>
                <Text style={styles.label}>Standings</Text>
                <View style={styles.table}>
                  <View style={styles.row}><Text style={[styles.cell, {flex: 2}]}>Team</Text><Text style={styles.cell}>P</Text><Text style={styles.cell}>GD</Text><Text style={styles.cell}>PTS</Text></View>
                  {getStats(activeT).map(([n, s], i) => (
                    <View key={i} style={[styles.row, {borderTopWidth: 1, borderColor: '#222'}]}>
                      <Text style={[styles.cell, {flex: 2, color: i === 0 ? COLORS.primary : '#fff'}]}>{n}</Text>
                      <Text style={styles.cell}>{s.p}</Text><Text style={styles.cell}>{s.gd}</Text><Text style={styles.cell}>{s.pts}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={[styles.label, {marginTop: 25}]}>{activeT.type === 'KNOCKOUT' ? 'Bracket / Rounds' : 'Fixtures'}</Text>
            {activeT.matches.map(m => (
              <View key={m.id} style={[styles.match, m.away === 'BYE' && {opacity: 0.5}]}>
                <View style={{flex: 1}}>
                  {activeT.type === 'KNOCKOUT' && <Text style={{color: COLORS.accent, fontSize: 9, fontWeight: 'bold'}}>ROUND {m.round}</Text>}
                  <Text style={styles.mTeam}>{m.home}</Text>
                </View>
                {m.away !== 'BYE' ? (
                  <>
                    <TextInput key={m.id+'h'} style={styles.mInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#444" defaultValue={m.hScore?.toString()} onEndEditing={(e) => updateMatch(activeT.id, m.id, e.nativeEvent.text, m.aScore)} />
                    <Text style={{color: COLORS.muted}}>:</Text>
                    <TextInput key={m.id+'a'} style={styles.mInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#444" defaultValue={m.aScore?.toString()} onEndEditing={(e) => updateMatch(activeT.id, m.id, m.hScore, e.nativeEvent.text)} />
                  </>
                ) : (
                  <Text style={{color: COLORS.muted, fontSize: 10, flex: 0.5, textAlign: 'center'}}>BYE</Text>
                )}
                <Text style={[styles.mTeam, {textAlign: 'right'}]}>{m.away}</Text>
              </View>
            ))}
            <View style={{height: 50}} />
          </ScrollView>
        ) : (
          <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
             <Text style={{color: COLORS.muted}}>Tournament not found</Text>
             <TouchableOpacity onPress={goHome} style={{marginTop: 20}}><Text style={{color: COLORS.primary}}>Go Back</Text></TouchableOpacity>
          </View>
        )
      )}

      {/* CREATE MODAL */}
      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Tournament</Text>
            <TextInput style={styles.input} placeholder="Tournament Name" placeholderTextColor="#666" value={name} onChangeText={setName} />
            <View style={styles.typeRow}>
              {['LEAGUE', 'KNOCKOUT', 'HOME_AWAY'].map(m => (
                <TouchableOpacity key={m} style={[styles.typeBtn, type === m && {backgroundColor: COLORS.primary}]} onPress={() => setType(m)}>
                  <Text style={{color: type === m ? '#000' : '#fff', fontSize: 10}}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={[styles.input, {height: 80}]} multiline placeholder="Teams (comma separated)" placeholderTextColor="#666" value={teamsRaw} onChangeText={setTeamsRaw} />
            <TouchableOpacity style={styles.btn} onPress={createTournament}><Text style={styles.btnText}>START PROJECT</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setModal(false)}><Text style={{color: COLORS.danger, textAlign: 'center', marginTop: 15}}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

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
  mTeam: { color: '#fff', flex: 1, fontSize: 13, fontWeight: '500' },
  mInput: { backgroundColor: COLORS.secondary, color: COLORS.primary, width: 35, height: 35, textAlign: 'center', borderRadius: 5, fontWeight: 'bold' }
});