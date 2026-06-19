import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, 
  Modal, Alert, StatusBar, Dimensions, Share, Platform, BackHandler,
  ActivityIndicator
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Icons from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { captureRef } from 'react-native-view-shot';

import { COLORS, escapeHtml, getTN, getTC, getStats, getPlayerStats } from './src/utils/tournamentHelpers';

const { width } = Dimensions.get('window');

// Backend Endpoint Configuration
// Backend Endpoint Configuration
// Read from environment variables.
// In development, `process.env.EXPO_PUBLIC_DEV_API_URL` should be your local IP.
// In production, `process.env.EXPO_PUBLIC_PROD_API_URL` should be your deployed server URL.
// Ensure these are set in your .env file (e.g., EXPO_PUBLIC_DEV_API_URL=http://192.168.1.5:3000/api)
const DEV_URL = process.env.EXPO_PUBLIC_DEV_API_URL; 
const PROD_URL = process.env.EXPO_PUBLIC_PROD_API_URL;
let SERVERLESS_ENDPOINT = __DEV__ ? DEV_URL : PROD_URL; // Changed const to let

// Validation for local development/misconfiguration
if (__DEV__ && !DEV_URL) {
  console.warn("EXPO_PUBLIC_DEV_API_URL is not set in your .env file. Using a placeholder. Please configure your local API URL.");
  // Fallback to a common local IP for emulator or a generic placeholder
  // User should still set their specific IP for physical devices.
  SERVERLESS_ENDPOINT = 'http://10.0.2.2:3000/api'; 
} else if (!__DEV__ && !PROD_URL) {
  console.error("EXPO_PUBLIC_PROD_API_URL is not set for production build. API calls may fail.");
  // Fallback to a known production URL or fail explicitly
  SERVERLESS_ENDPOINT = 'https://deeppitch-engine.vercel.app/api'; // Fallback to original PROD URL
}

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
  const [loading, setLoading] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimeoutRef = useRef(null);
  const standingsRef = useRef();
  const bracketRef = useRef();
  const backPressCount = useRef(0);

  // AsyncStorage Keys
  // Moved escapeHtml, getTN, getTC, getStats, getPlayerStats to src/utils/tournamentHelpers.js
  const STORAGE_KEY_LIST = '@DP_TOURNAMENT_LIST'; // Stores [{id, name, type}, ...]
  const STORAGE_KEY_TOURNAMENT_PREFIX = '@DP_TOURNAMENT_DATA:'; // Stores full tournament data
  const STORAGE_KEY_ACTIVE_ID = '@DP_ACTIVE_ID'; // Stores active tournament ID

  const showToast = (message, duration = 2000) => {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastVisible(false);
    }, duration);
  };

  useEffect(() => {
    const backAction = () => {
      // Priority 1: Close Modals
      if (matchModal) { setMatchModal(false); return true; }
      if (teamModal) { setTeamModal(false); return true; }
      if (modal) { setModal(false); return true; }

      // Priority 2: Navigation
      if (screen === 'MANAGE') {
        goHome();
        return true;
      }

      // Priority 3: Exit App (Home Screen)
      if (screen === 'HOME') {
        if (backPressCount.current === 1) {
          BackHandler.exitApp();
        } else {
          backPressCount.current = 1;
          showToast('Press back twice to exit'); // Cross-platform toast
          setTimeout(() => { backPressCount.current = 0; }, 2000);
          return true;
        }
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [screen, modal, matchModal, teamModal]);

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState('LEAGUE'); // LEAGUE, KNOCKOUT, GROUPS
  const [template, setTemplate] = useState('CUSTOM');
  const [teamsRaw, setTeamsRaw] = useState('');
  const [teamsPerGroup, setTeamsPerGroup] = useState('4');
  const [qualifiersCount, setQualifiersCount] = useState('2');
  const [tieBreakers, setTieBreakers] = useState(['GD', 'H2H', 'GS', 'FP']);
  const [homeAwayEnabled, setHomeAwayEnabled] = useState(false); // New state for home/away matches

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

  // Helper to save just the list of tournament metadata (ID, name, type)
  const saveTournamentList = async (listMetadata) => {
    await AsyncStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(listMetadata));
  };

  // Helper to save a single tournament's full data
  const saveTournament = async (tournament) => {
    await AsyncStorage.setItem(STORAGE_KEY_TOURNAMENT_PREFIX + tournament.id, JSON.stringify(tournament));
  };

  // Helper to delete a single tournament's full data
  const deleteTournamentData = async (id) => {
    await AsyncStorage.removeItem(STORAGE_KEY_TOURNAMENT_PREFIX + id);
  };

  const load = async () => {
    try {
      setLoading(true);
      const listMetadataString = await AsyncStorage.getItem(STORAGE_KEY_LIST);
      const lastActive = await AsyncStorage.getItem(STORAGE_KEY_ACTIVE_ID);
      let loadedTournaments = [];
      
      if (listMetadataString) {
        const listMetadata = JSON.parse(listMetadataString);
        const fetchPromises = listMetadata.map(async (meta) => {
          try {
            const tournamentData = await AsyncStorage.getItem(STORAGE_KEY_TOURNAMENT_PREFIX + meta.id);
            if (tournamentData) {
              return JSON.parse(tournamentData);
            }
          } catch (e) {
            console.error(`Error loading tournament data for ID ${meta.id}:`, e);
          }
          return null;
        });
        loadedTournaments = (await Promise.all(fetchPromises)).filter(Boolean);
        setTournaments(loadedTournaments);
      }

      if (lastActive) {
        const foundActive = loadedTournaments.find(t => t.id === lastActive);
        if (foundActive) {
          setActiveID(lastActive);
          setScreen('MANAGE');
        } else { // Active ID no longer exists, clear it
          await AsyncStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
        }
      }
    } catch (e) {
      console.error("Failed to load tournaments from storage", e);
      Alert.alert("Load Error", "Failed to load tournament data. Some data might be corrupted.");
    } finally {
      setLoading(false);
    }
  };

  const deleteTournament = (id) => {
    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel" },
      { text: "Delete", onPress: async () => {
        const filtered = tournaments.filter(t => t.id !== id);
        
        // Update local state
        setTournaments(filtered); 

        // Delete individual tournament data and update the list metadata
        await deleteTournamentData(id);
        await saveTournamentList(filtered.map(t => ({ id: t.id, name: t.name, type: t.type })));

        // Clear active tournament if it was the one deleted
        await AsyncStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
        setActiveID(null);
        setScreen('HOME');
      }}
    ]);
  };

  const selectTournament = async (id) => {
    setActiveID(id);
    setScreen('MANAGE');
    await AsyncStorage.setItem(STORAGE_KEY_ACTIVE_ID, id);
  };

  const goHome = async () => {
    setScreen('HOME');
    setActiveID(null);
    await AsyncStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
  };



  // --- THE FINAL PERMANENT FIX ---
  const saveAndSharePdf = async (base64Data, baseName) => {
    try {
      // 1. Create a clean filename
      const cleanName = baseName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      
      // 2. Use cacheDirectory (best for sharing)
      const destinationUri = `${FileSystem.cacheDirectory}${cleanName}.pdf`;

      // 3. Write the file using the legacy method (Base64 encoding)
      // This works because we are creating a NEW file, not reading a restricted one
      await FileSystem.writeAsStringAsync(destinationUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 4. Share the file
      await Sharing.shareAsync(destinationUri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share ${baseName}`,
        UTI: 'com.adobe.pdf'
      });
    } catch (error) {
      console.error("Internal Share Error:", error);
      Alert.alert("Export Error", "Failed to prepare PDF. Please try again.");
    }
  };

  const generateMarkdownReport = (t) => {
    if (!t) return "";
    let report = `🏆 *${t.name.toUpperCase()}*\n`;
    report += `Format: ${t.type.replace('_', ' ')} | Teams: ${t.teams.length}\n`;
    report += `----------------------------------\n\n`;

    // 1. Standings
    report += `📊 *STANDINGS*\n`;
    if (t.type === 'GROUPS') {
      const groups = [...new Set(t.matches.filter(m => m.group).map(m => m.group))].sort();
      groups.forEach(g => {
        report += `\n*GROUP ${g}*\n`;
        report += `Team | P | GD | PTS\n`;
        const groupStats = getStats({...t, matches: t.matches.filter(m => m.group === g)});
        groupStats.forEach(([id, s]) => {
          report += `${getTN(id, t)} | ${s.p} | ${s.gd} | ${s.pts}\n`;
        });
      });
    } else {
      report += `Pos | Team | P | GD | PTS\n`;
      const stats = getStats(t);
      stats.forEach(([id, s], i) => {
        report += `${i + 1}. ${getTN(id, t)} | ${s.p} | ${s.gd} | ${s.pts}\n`;
      });
    }
    report += `\n`;

    // 2. Statistics
    const { scorers, assisters, cards } = getPlayerStats(t);
    report += `⚽ *PLAYER STATISTICS*\n`;
    if (scorers.length > 0) {
      report += `Top Scorers:\n`;
      scorers.slice(0, 5).forEach(([name, count]) => report += `• ${name}: ${count} G\n`);
    }
    if (assisters.length > 0) {
      report += `Top Assists:\n`;
      assisters.slice(0, 5).forEach(([name, count]) => report += `• ${name}: ${count} A\n`);
    }
    report += `\n`;

    // 3. Fixtures & Results
    report += `🗓️ *FIXTURES & RESULTS*\n`;
    const sortedMatches = [...t.matches].sort((a, b) => {
      if (a.round !== b.round) return (a.round || 0) - (b.round || 0);
      if (a.group !== b.group) return (a.group || "").localeCompare(b.group || "");
      return 0;
    });

    sortedMatches.forEach(m => {
      if (m.away === 'BYE') return;
      const matchType = m.round ? `Round ${m.round}` : (m.group ? `Group ${m.group}` : "Match");
      const score = m.done ? `${m.hScore} - ${m.aScore}` : (m.status === 'LIVE' ? "LIVE" : "VS");
      report += `[${matchType}] ${getTN(m.home, t)} ${score} ${getTN(m.away, t)}\n`;
      if (m.events && m.events.length > 0) {
        m.events.forEach(e => {
          report += `  - ${e.type}: ${e.player} (${getTN(e.teamId, t)})\n`;
        });
      }
    });
    report += `\n`;

    // 4. Rosters
    report += `👥 *TEAM ROSTERS*\n`;
    t.teams.forEach(team => {
      report += `*${team.name}*: ${team.players.map(p => `${p.name}`).join(', ')}\n`;
    });

    report += `\n_Generated by DEEPPITCH_`;
    return report;
  };

  const shareTournament = async (t) => {
    try {
      const content = generateMarkdownReport(t);
      await Share.share({
        message: content,
        title: `${t.name} - Full Tournament Details`
      });
    } catch (e) {
      Alert.alert("Share Error", "Failed to generate shareable text content.");
    }
  };

  // This `save` function now takes the *entire* updated list of tournaments
  // and intelligently saves metadata and individual tournament data.
  const save = async (updatedTournamentsList) => {
    setTournaments(updatedTournamentsList); // Update local state immediately

    // Prepare metadata list (only id, name, type for display)
    const listMetadata = updatedTournamentsList.map(t => ({ id: t.id, name: t.name, type: t.type }));
    await saveTournamentList(listMetadata);

    // Save each tournament's full data individually
    for (const tourney of updatedTournamentsList) {
      await saveTournament(tourney);
    }
  };

  const createTournament = async () => { // Make function async
    const teamNames = teamsRaw.split(',').map(t => t.trim()).filter(t => t);
    
    // Validation
    if (!name) return Alert.alert("Error", "Tournament name required");
    if (teamNames.length === 0) return Alert.alert("Error", "Please enter at least one team name.");

    // Check for duplicate team names
    const uniqueTeamNames = new Set(teamNames);
    if (uniqueTeamNames.size !== teamNames.length) {
      return Alert.alert("Error", "All team names must be unique. Please remove duplicate names.");
    }

    if (type === 'GROUPS') {
      if (teamNames.length < 4) return Alert.alert("Error", "Minimum 4 teams required for Group format.");

      const parsedTeamsPerGroup = parseInt(teamsPerGroup, 10);
      const parsedQualifiersCount = parseInt(qualifiersCount, 10);

      if (isNaN(parsedTeamsPerGroup) || parsedTeamsPerGroup < 2) {
        return Alert.alert("Error", "Teams per group must be a number of 2 or more.");
      }
      if (isNaN(parsedQualifiersCount) || parsedQualifiersCount < 1) {
        return Alert.alert("Error", "Qualifiers count must be a number of 1 or more.");
      }
      if (parsedQualifiersCount >= parsedTeamsPerGroup) {
        return Alert.alert("Error", "Qualifiers count must be less than the number of teams per group.");
      }
      if (teamNames.length < parsedTeamsPerGroup) {
        return Alert.alert("Error", `Total number of teams (${teamNames.length}) cannot be less than teams per group (${parsedTeamsPerGroup}).`);
      }
    } else { // LEAGUE or KNOCKOUT
      if (teamNames.length < 2) return Alert.alert("Error", "Minimum 2 teams required for this format.");
    }

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
      matches: generateMatches(teams, type, parseInt(teamsPerGroup), parseInt(qualifiersCount), homeAwayEnabled),
      settings: { ptsWin: 3, ptsDraw: 1, ptsLoss: 0, tieBreakers },
      config: { teamsPerGroup, qualifiersCount, homeAwayEnabled }, // Store homeAwayEnabled in config
      status: 'ACTIVE'
    };

    const updatedTournaments = [...tournaments, newTourney];
    
    // Update local state and persist to AsyncStorage
    await save(updatedTournaments); // Uses the updated save function

    setModal(false);
    setName(''); setTeamsRaw(''); setTemplate('CUSTOM');
    setType('LEAGUE'); // Reset type to default
    setTeamsPerGroup('4'); // Reset
    setQualifiersCount('2'); // Reset
    setTieBreakers(['GD', 'H2H', 'GS', 'FP']); // Reset
    setHomeAwayEnabled(false); // Reset new homeAwayEnabled setting
    selectTournament(newTourney.id);
  };

  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Helper function to generate matches based on tournament type
  function generateMatches(teams, mode, groupSize = 4, quals = 2, isHomeAway = false) {
    let matches = [];

    // Fisher-Yates Shuffle for better randomization of team pairings initially
    let shuffledTeams = [...teams];
    for (let i = shuffledTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledTeams[i], shuffledTeams[j]] = [shuffledTeams[j], shuffledTeams[i]];
    }

    const teamIds = shuffledTeams.map(t => t.id); // Ensure we use team.id

    // Helper to generate Round-Robin matches (Circle Method)
    const generateRoundRobin = (participants, roundOffset = 0, groupLabel = null, roundRobinHomeAway = false) => { // Added roundRobinHomeAway
      let allRoundsMatches = []; // Accumulate matches for all rounds
      let currentParticipants = [...participants];
      const N = currentParticipants.length;

      // Handle odd number of teams by adding a dummy 'BYE'
      const hasBye = N % 2 !== 0;
      if (hasBye) {
        currentParticipants.push('BYE');
      }
      const numParticipants = currentParticipants.length; // Now guaranteed to be even
      const numRounds = numParticipants - 1;

      for (let r = 0; r < numRounds; r++) {
        let matchesInThisRound = []; // Collect matches for the current round
        for (let i = 0; i < numParticipants / 2; i++) {
          const home = currentParticipants[i];
          const away = currentParticipants[numParticipants - 1 - i];

          if (home !== 'BYE' && away !== 'BYE') {
            matchesInThisRound.push({
              id: generateId(),
              group: groupLabel,
              round: r + 1 + roundOffset,
              home: home,
              away: away,
              hScore: '0',
              aScore: '0',
              done: false,
              events: [],
              status: 'PENDING',
              time: 0
            });
            if (roundRobinHomeAway) { // Use the new flag
              matchesInThisRound.push({
                id: generateId(),
                group: groupLabel,
                round: r + 1 + numRounds + roundOffset, // Second leg starts after first leg completes all rounds
                home: away,
                away: home,
                hScore: '0',
                aScore: '0',
                done: false,
                events: [],
                status: 'PENDING',
                time: 0
              });
            }
          }
        }
        // Shuffle matches within this specific round for randomness
        for (let i = matchesInThisRound.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [matchesInThisRound[i], matchesInThisRound[j]] = [matchesInThisRound[j], matchesInThisRound[i]];
        }
        allRoundsMatches.push(...matchesInThisRound); // Add all shuffled matches of this round

        // Rotate all teams except the first one (which stays fixed in the top-left)
        // Move last team to second position, shift others right
        const last = currentParticipants.pop();
        currentParticipants.splice(1, 0, last);
      }
      return allRoundsMatches; // Return all matches, ordered by round, with randomness within rounds
    };

    if (mode === 'LEAGUE') { // Removed 'HOME_AWAY' type, now handled by isHomeAway flag
      matches = generateRoundRobin(teamIds, 0, null, isHomeAway); // Pass isHomeAway
    } else if (mode === 'GROUPS') {
      const actualNumGroups = Math.ceil(teamIds.length / groupSize);
      const groups = Array.from({ length: actualNumGroups }, () => []);
      
      // Shuffle teamIds BEFORE distributing them into groups for random group assignment
      let shuffledTeamIdsForGroups = [...teamIds];
      for (let i = shuffledTeamIdsForGroups.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledTeamIdsForGroups[i], shuffledTeamIdsForGroups[j]] = [shuffledTeamIdsForGroups[j], shuffledTeamIdsForGroups[i]];
      }

      // Distribute teams evenly into groups using a round-robin assignment
      shuffledTeamIdsForGroups.forEach((teamId, index) => { // Use shuffled list here
        groups[index % actualNumGroups].push(teamId);
      });

      for (let g = 0; g < actualNumGroups; g++) {
        const groupTeams = groups[g];
        if (groupTeams.length > 0) { // Only generate matches if the group has teams
          const groupLabel = String.fromCharCode(65 + g);
          matches.push(...generateRoundRobin(groupTeams, 0, groupLabel, isHomeAway)); // Pass isHomeAway
        }
      }
      // Sort matches by round (1, 2, 3), then by group (A, B, C) for display
      matches.sort((a, b) => {
        if ((a.round || 0) !== (b.round || 0)) return (a.round || 0) - (b.round || 0); // Primary sort by round
        if (a.group && b.group && a.group !== b.group) return a.group.localeCompare(b.group); // Secondary sort by group
        return 0;
      });
    } else { // KNOCKOUT
      let roundParticipants = [...teamIds];

      const participantCount = roundParticipants.length;
      const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(participantCount)));
      const byes = nextPowerOfTwo - participantCount;

      // Add BYEs
      for (let i = 0; i < byes; i++) roundParticipants.push('BYE');

      // Re-shuffle all participants (teams + BYEs) to randomize BYE placement
      // This shuffle is critical for fair initial pairings in knockouts
      for (let i = roundParticipants.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roundParticipants[i], roundParticipants[j]] = [roundParticipants[j], roundParticipants[i]];
      }

      for (let i = 0; i < roundParticipants.length; i += 2) {
        const home = roundParticipants[i], away = roundParticipants[i + 1];
        const isBye = away === 'BYE';
        matches.push({
          id: generateId(), round: 1, roundIdx: i / 2,
          home, away, hScore: isBye ? '1' : '0', aScore: isBye ? '0' : '0',
          done: isBye, winner: isBye ? home : null, events: [], status: isBye ? 'DONE' : 'PENDING', time: 0
        });
      }
      // For Knockouts, initial round order can remain randomized after pairing.
      // Further matches will be generated sequentially as results come in.
      // A general random sort for initial knockout fixtures is acceptable.
      matches.sort(() => Math.random() - 0.5);
    }
    
    // For LEAGUE, matches are already generated round-by-round and randomized within rounds.
    // For GROUPS, matches are sorted by group then by round, with randomness within group rounds.
    // This maintains the "match day" and "group completion" logic requested.
    return matches;
  }

  const updateTeam = (team) => {
    const updated = tournaments.map(t => {
      if (t.id === activeID) {
        t.teams = t.teams.map(tm => tm.id === team.id ? team : tm);
      }
      return t;
    });
    save(updated);
  };

  const randomizeFixtures = () => {
    if (!activeT) return;
    Alert.alert(
      "Randomize Fixtures",
      "This will shuffle all pairings. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Randomize", 
          onPress: async () => {
            const newMatches = generateMatches(
              activeT.teams, 
              activeT.type, 
              parseInt(activeT.config?.teamsPerGroup || 4), 
              parseInt(activeT.config?.qualifiersCount || 2),
              activeT.config?.homeAwayEnabled || false // Pass homeAwayEnabled from active tournament config
            );
            const updated = tournaments.map(t => {
              if (t.id === activeID) { return { ...t, matches: newMatches }; }
              return t;
            });
            await save(updated);
            if (Platform.OS === 'android') {
              ToastAndroid.show('Fixtures Randomized!', ToastAndroid.SHORT);
            }
          }
        }
      ]
    );
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

        // After updating a match, apply any necessary tournament logic
        // Extracting this logic into separate helper functions for clarity.
        
        // Handle knockout advancement if applicable
        newMatches = advanceKnockoutRound(newMatches, updatedMatchObj);

        // Handle transition from group stage to knockout stage if all group matches are done
        newMatches = transitionGroupToKnockout(newMatches, t.type, t.config, t.teams, t.settings);
        
        return { ...t, matches: newMatches };
      }
      return t;
    });
    if (updatedMatchObj) setSelectedMatch(updatedMatchObj);
    save(updated);
  };


  // Helper function to advance teams in knockout rounds
  const advanceKnockoutRound = (matches, currentMatch) => {
    let updatedMatches = [...matches];
    // Only process if it's a knockout-style match (has a round number) and is done with a clear winner
    if (currentMatch && currentMatch.round && currentMatch.done && currentMatch.winner && currentMatch.winner !== 'DRAW') {
      const roundMatches = updatedMatches.filter(m => m.round === currentMatch.round);
      const matchInRoundIndex = currentMatch.roundIdx;
      const nextRound = (currentMatch.round || 0) + 1;
      const nextMatchInRoundIndex = Math.floor(matchInRoundIndex / 2);
      
      let nextMatch = updatedMatches.find(m => m.round === nextRound && m.roundIdx === nextMatchInRoundIndex);
      
      // If the next match doesn't exist AND it's not the final match of the current round (i.e., we need to create a new match in the next round)
      if (!nextMatch && roundMatches.length > 1) { 
        nextMatch = { 
          id: generateId(), 
          round: nextRound, 
          roundIdx: nextMatchInRoundIndex, 
          home: '?', 
          away: '?', 
          hScore: '', 
          aScore: '', 
          done: false, 
          events: [], 
          status: 'PENDING', 
          time: 0 
        };
        updatedMatches.push(nextMatch);
      }
      
      // If a next match (either existing or newly created) is found, assign the winner
      if (nextMatch) {
        if (matchInRoundIndex % 2 === 0) nextMatch.home = currentMatch.winner;
        else nextMatch.away = currentMatch.winner;
      }
    }
    return updatedMatches;
  };

  // Helper function to transition from group stage to knockout stage
  const transitionGroupToKnockout = (matches, tournamentType, tournamentConfig, allTeams, tournamentSettings) => {
    let updatedMatches = [...matches];
    // Only process if it's a group tournament and no knockout rounds have been generated yet
    if (tournamentType === 'GROUPS' && !updatedMatches.some(m => m.round)) {
      const allGroupMatchesDone = updatedMatches.filter(m => m.group).every(m => m.done);
      if (allGroupMatchesDone) {
        const qualifiedIds = [];
        const groups = [...new Set(updatedMatches.filter(m => m.group).map(m => m.group))];
        groups.forEach(g => {
          // Temporarily create a tournament-like object for getStats to work on the group
          const groupSpecificTournament = { 
            teams: allTeams, 
            matches: updatedMatches.filter(m => m.group === g), 
            settings: tournamentSettings 
          };
          const groupStats = getStats(groupSpecificTournament);
          qualifiedIds.push(...groupStats.slice(0, tournamentConfig.qualifiersCount).map(s => s[0]));
        });
        
        // Get full team objects for qualified IDs to generateMatches
        const qualifiedFullTeams = allTeams.filter(team => qualifiedIds.includes(team.id));
        const knockoutMatches = generateMatches(qualifiedFullTeams, 'KNOCKOUT');
        
        // Add generated knockout matches, ensuring they start from round 1
        updatedMatches.push(...knockoutMatches.map(m => ({...m, round: 1})));
      }
    }
    return updatedMatches;
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
      console.error("Image Export Error:", e);
    }
  };

  const exportAsCSV = async () => {
    if (!activeT) return;
    setLoading(true);
    try {
      // Retrieve API Key from environment variables
      const SERVERLESS_API_KEY = process.env.EXPO_PUBLIC_SERVERLESS_API_KEY;
      if (!SERVERLESS_API_KEY) {
        throw new Error("API key not configured for serverless endpoint.");
      }

      const response = await fetch(SERVERLESS_ENDPOINT, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVERLESS_API_KEY}` // Add Authorization header
        },
        body: JSON.stringify({ action: 'GENERATE_CSV', tournament: activeT }),
      });

      if (!response.ok) throw new Error("Connection to engine failed.");

      const data = await response.json();
      if (!data.success || !data.csv) throw new Error(data.error || "Failed to generate CSV.");
      
      const fileName = `${activeT.name.replace(/\s+/g, '_')}_fixtures.csv`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, data.csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri);
    } catch (e) {
      Alert.alert("Export Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const exportAsPDF = async (type) => {
    if (!activeT) return;
    setLoading(true);
    try {
      // Retrieve API Key from environment variables
      const SERVERLESS_API_KEY = process.env.EXPO_PUBLIC_SERVERLESS_API_KEY;
      if (!SERVERLESS_API_KEY) {
        throw new Error("API key not configured for serverless endpoint.");
      }
      
      const response = await fetch(SERVERLESS_ENDPOINT, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVERLESS_API_KEY}` // Add Authorization header
        },
        body: JSON.stringify({ action: 'GENERATE_PDF_HTML', tournament: activeT, type: type }),
      });

      const data = await response.json();
      if (!data.success) throw new Error("Failed to generate HTML.");
      
      // Get the base64 string
      const { base64 } = await Print.printToFileAsync({ 
        html: data.html, 
        base64: true 
      });
      
      await saveAndSharePdf(base64, `DeepPitch_${type}`);

    } catch (e) {
      Alert.alert("PDF Export Error", e.message);
    } finally {
      setLoading(false);
    }
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
              <TouchableOpacity onPress={() => exportAsPDF('FULL_REPORT')}><Icons.FileText color={COLORS.gold} size={20} /></TouchableOpacity>
              <TouchableOpacity onPress={() => shareTournament(activeT)}><Icons.Share2 color={COLORS.accent} size={20} /></TouchableOpacity>
              <TouchableOpacity onPress={() => deleteTournament(activeID)}><Icons.Trash2 color={COLORS.danger} size={20} /></TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={() => setModal(true)}><Icons.PlusCircle color={COLORS.primary} /></TouchableOpacity>
        </View>
      </View>

      {screen === 'HOME' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Hero Section */}
          <View style={styles.hero}>
            <View>
              <Text style={styles.heroTitle}>Tournament</Text>
              <Text style={[styles.heroTitle, { color: COLORS.primary }]}>Command Center</Text>
              <Text style={styles.heroSub}>{tournaments.length} Active Competitions</Text>
            </View>
            <View style={styles.heroIconCircle}>
              <Icons.Trophy color={COLORS.primary} size={32} />
            </View>
          </View>

          <View style={{ paddingHorizontal: 20 }}>
            {/* Quick Actions */}
            <Text style={styles.sectionLabel}>Quick Actions</Text>
            <TouchableOpacity 
              style={styles.createMainBtn} 
              onPress={() => setModal(true)}
            >
              <View style={styles.createMainBtnIcon}>
                <Icons.Plus color="#000" size={24} />
              </View>
              <View>
                <Text style={styles.createMainBtnTitle}>Create New Tournament</Text>
                <Text style={styles.createMainBtnSub}>League, Knockout, or Group Stage</Text>
              </View>
            </TouchableOpacity>

            {/* Tournaments List */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, marginBottom: 15 }}>
              <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>Recent Tournaments</Text>
              {tournaments.length > 0 && <Text style={{ color: COLORS.text, fontSize: 10 }}>{tournaments.length} TOTAL</Text>}
            </View>

            {tournaments.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconCircle}>
                  <Icons.LayoutGrid color={COLORS.border} size={40} />
                </View>
                <Text style={styles.emptyText}>No tournaments found</Text>
                <Text style={styles.emptySub}>Start by creating your first professional bracket or league.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => setModal(true)}>
                  <Text style={styles.emptyBtnText}>GET STARTED</Text>
                </TouchableOpacity>
              </View>
            ) : (
              tournaments.map(t => (
                <TouchableOpacity key={t.id} style={styles.tCard} onPress={() => selectTournament(t.id)}>
                  <View style={styles.tCardIcon}>
                    {(typeof t.type === 'string' && t.type === 'LEAGUE' && Icons.Trophy) ? <Icons.Trophy color={COLORS.gold} size={18} /> : 
                     (typeof t.type === 'string' && t.type === 'KNOCKOUT' && Icons.Zap) ? <Icons.Zap color={COLORS.accent} size={18} /> : 
                     (typeof t.type === 'string' && t.type === 'GROUPS' && Icons.LayoutGrid) ? <Icons.LayoutGrid color={COLORS.primary} size={18} /> :
                     (Icons.CircleDot ? <Icons.CircleDot color={COLORS.muted} size={18} /> : null)}
                  </View>
                  <View style={{ flex: 1, marginLeft: 15 }}>
                    <Text style={styles.tName}>{t.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <View style={styles.typeTag}>
                        <Text style={styles.typeTagText}>{t.type.replace('_', ' ')}</Text>
                      </View>
                      <Text style={styles.tSub}>{t.teams.length} Teams</Text>
                    </View>
                  </View>
                  <Icons.ChevronRight color={COLORS.border} size={20} />
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      ) : (
        activeT ? (
          <View style={{flex: 1}}>
            <View style={styles.tabBar}>
              {['FIXTURES', 'STANDINGS', 'TEAMS', 'STATS', 'BRACKET'].map(tab => {
                if (tab === 'BRACKET' && activeT.type === 'LEAGUE' && !activeT.matches.some(m => m.round)) return null;
                // 'HOME_AWAY' type is now absorbed into LEAGUE/GROUPS with a flag, so remove this specific check
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
                        <StandingsTable data={getStats({...activeT, matches: activeT.matches.filter(m => m.group === g)})} resolveName={(id) => getTN(id, activeT)} />
                      </View>
                    ))
                  ) : (
                    <StandingsTable data={getStats(activeT)} resolveName={(id) => getTN(id, activeT)} />
                  )}
                </View>
              )}

              {activeTab === 'FIXTURES' && (
                <>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
                    {activeT.matches.every(m => !m.done && m.status === 'PENDING') ? (
                      <TouchableOpacity 
                        onPress={randomizeFixtures} 
                        style={[styles.miniBtn, {borderColor: COLORS.gold}]}
                      >
                        <Icons.RefreshCw color={COLORS.gold} size={14} />
                        <Text style={[styles.miniBtnText, {color: COLORS.gold}]}>RANDOMIZE FIXTURES</Text>
                      </TouchableOpacity>
                    ) : (
                      <View />
                    )}
                    <View style={{flexDirection: 'row', gap: 10}}>
                      <TouchableOpacity onPress={() => exportAsPDF('FIXTURES')} style={styles.miniBtn}>
                        <Icons.FileText color={COLORS.accent} size={14} />
                        <Text style={styles.miniBtnText}>PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={exportAsCSV} style={styles.miniBtn}>
                        <Icons.Table color={COLORS.primary} size={14} />
                        <Text style={styles.miniBtnText}>CSV</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {activeT.matches.map(m => (
                  <TouchableOpacity 
                    key={m.id} 
                    disabled={m.away === 'BYE'}
                    onPress={() => { setSelectedMatch(m); setMatchModal(true); }}
                    style={[styles.match, m.away === 'BYE' && {opacity: 0.5}]}
                  >
                    <View style={{flex: 1}}>
                      {m.group && <Text style={styles.mTag}>GROUP {m.group}</Text>}
                      {m.round && <Text style={[styles.mTag, {color: COLORS.gold}]}>ROUND {m.round}</Text>}
                      <Text style={[styles.mTeam, {color: getTC(m.home, activeT)}]}>{getTN(m.home, activeT)}</Text>
                    </View>
                    {m.away !== 'BYE' ? (
                      <View style={{alignItems: 'center', minWidth: 80}}>
                        {m.status === 'LIVE' && (
                          <Text style={{color: COLORS.primary, fontSize: 10, fontWeight: 'bold', marginBottom: 2}}>
                            {Math.floor(m.time / 60)}' {m.addedTime ? `+${m.addedTime}` : ''}
                          </Text>
                        )}
                        <View style={[styles.scoreBadge, m.done && {backgroundColor: COLORS.primary + '20', borderColor: COLORS.primary}, m.status === 'LIVE' && {backgroundColor: COLORS.danger + '20', borderColor: COLORS.danger}]}>
                          <Text style={[styles.scoreText, m.done && {color: COLORS.primary}, m.status === 'LIVE' && {color: COLORS.danger}]}>
                            {m.done || m.status === 'LIVE' ? `${m.hScore} - ${m.aScore}` : 'VS'}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <Text style={{color: COLORS.muted, fontSize: 10, flex: 0.5, textAlign: 'center'}}>BYE</Text>
                    )}
                    <Text style={[styles.mTeam, {textAlign: 'right', flex: 1, color: getTC(m.away, activeT)}]}>{getTN(m.away, activeT)}</Text>
                  </TouchableOpacity>
                ))}
                </>
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
                    
                    if (rounds.length === 0) {
                      return (
                        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: width - 40}}>
                          <Icons.Info color={COLORS.muted} size={24} />
                          <Text style={{color: COLORS.muted, marginTop: 10, textAlign: 'center'}}>
                            No knockout matches generated yet or tournament not in knockout stage.
                          </Text>
                        </View>
                      );
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
                                  <Text numberOfLines={1} style={[styles.bracketTeamText, m.winner === m.home && { color: COLORS.primary }]}>{getTN(m.home, activeT)}</Text>
                                  <Text style={styles.bracketScore}>{m.hScore}</Text>
                                </View>
                                <View style={[styles.bracketTeam, { borderTopWidth: 1, borderColor: COLORS.border }]}>
                                  <Text numberOfLines={1} style={[styles.bracketTeamText, m.winner === m.away && { color: COLORS.primary }]}>{getTN(m.away, activeT)}</Text>
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
            
            <Text style={[styles.label, {fontSize: 10}]}>Format Templates</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 15, maxHeight: 40}}>
              {[
                {id: 'CUSTOM', n: 'Custom'},
                {id: 'WC', n: 'World Cup (32)', t: 'GROUPS', g: '4', q: '2', ha: false},
                {id: 'UCL', n: 'UCL (32)', t: 'GROUPS', g: '4', q: '2', ha: true},
                {id: 'EURO', n: 'Euro (24)', t: 'GROUPS', g: '4', q: '2', ha: false},
                {id: 'KO16', n: 'Bracket (16)', t: 'KNOCKOUT', ha: false},
                {id: 'L10', n: 'League (10)', t: 'LEAGUE', ha: true}
              ].map(tmp => (
                <TouchableOpacity 
                  key={tmp.id} 
                  style={[styles.miniBtn, {marginRight: 8, borderColor: template === tmp.id ? COLORS.primary : COLORS.border}]} 
                  onPress={() => {
                    setTemplate(tmp.id);
                    if (tmp.t) setType(tmp.t);
                    if (tmp.g) setTeamsPerGroup(tmp.g);
                    if (tmp.q) setQualifiersCount(tmp.q);
                    if (tmp.ha !== undefined) setHomeAwayEnabled(tmp.ha); // Set homeAwayEnabled based on template
                    if (name === '') setName(tmp.n + ' Tournament');
                    
                    // Pre-fill teams based on template
                    let prefilledTeams = '';
                    switch (tmp.id) {
                      case 'WC':
                      case 'UCL':
                        prefilledTeams = 'Real Madrid, Barcelona, Bayern Munich, Liverpool, Man City, PSG, Juventus, Man United, Chelsea, Arsenal, AC Milan, Inter Milan, Atletico Madrid, Borussia Dortmund, Tottenham, Napoli, Benfica, Porto, Ajax, Feyenoord, Roma, Lazio, Sevilla, Villarreal, RB Leipzig, Bayer Leverkusen, Celtic, Rangers, Galatasaray, Besiktas, Marseille, Lyon';
                        break;
                      case 'EURO':
                        prefilledTeams = 'England, France, Germany, Spain, Italy, Portugal, Netherlands, Belgium, Croatia, Switzerland, Denmark, Austria, Serbia, Scotland, Turkey, Ukraine, Poland, Hungary, Czech Republic, Slovakia, Romania, Slovenia, Albania, Georgia';
                        break;
                      case 'KO16':
                        prefilledTeams = 'Team A, Team B, Team C, Team D, Team E, Team F, Team G, Team H, Team I, Team J, Team K, Team L, Team M, Team N, Team O, Team P';
                        break;
                      case 'L10':
                        prefilledTeams = 'Dragons, Phoenix, Titans, Warriors, Spartans, Knights, Vikings, Hawks, Falcons, Bears';
                        break;
                      default:
                        prefilledTeams = '';
                    }
                    setTeamsRaw(prefilledTeams);
                  }}
                >
                  <Text style={{color: template === tmp.id ? COLORS.primary : '#fff', fontSize: 10, fontWeight: 'bold'}}>{tmp.n}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput style={styles.input} placeholder="Tournament Name" placeholderTextColor="#666" value={name} onChangeText={setName} />
            <View style={styles.typeRow}>
              {['LEAGUE', 'KNOCKOUT', 'GROUPS'].map(m => ( // Removed 'HOME_AWAY' type
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
              <View style={{ marginBottom: 15 }}>
                <Text style={[styles.label, { fontSize: 10 }]}>Match Format</Text>
                <View style={styles.typeRow}>
                  <TouchableOpacity
                    style={[styles.typeBtn, !homeAwayEnabled && { borderColor: COLORS.primary, borderWidth: 1 }]}
                    onPress={() => setHomeAwayEnabled(false)}
                  >
                    <Text style={{ color: !homeAwayEnabled ? COLORS.primary : '#fff', fontSize: 10, fontWeight: 'bold' }}>SINGLE ENCOUNTER</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeBtn, homeAwayEnabled && { borderColor: COLORS.primary, borderWidth: 1 }]}
                    onPress={() => setHomeAwayEnabled(true)}
                  >
                    <Text style={{ color: homeAwayEnabled ? COLORS.primary : '#fff', fontSize: 10, fontWeight: 'bold' }}>HOME & AWAY</Text>
                  </TouchableOpacity>
                </View>
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
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5}}>
              <Text style={[styles.label, {fontSize: 10, marginBottom: 0}]}>Teams (comma separated)</Text>
              {template !== 'CUSTOM' && <Text style={{color: COLORS.text, fontSize: 10}}>Required: {
                template === 'WC' || template === 'UCL' ? '32' : (template === 'EURO' ? '24' : (template === 'KO16' ? '16' : (template === 'L10' ? '10' : '')))
              } teams</Text>}
            </View>
            <TextInput style={[styles.input, {height: 80}]} multiline placeholder="Team 1, Team 2, Team 3..." placeholderTextColor="#666" value={teamsRaw} onChangeText={setTeamsRaw} />
            <TouchableOpacity style={styles.btn} onPress={createTournament}><Text style={styles.btnText}>CREATE TOURNAMENT</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setModal(false)}><Text style={{color: COLORS.danger, textAlign: 'center', marginTop: 15}}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={teamModal} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={[styles.modalContent, {maxHeight: '85%'}]}>
            {editingTeam && activeT && (
              <ScrollView keyboardShouldPersistTaps="handled">
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
                  <Text style={[styles.modalTitle, {marginBottom: 0}]}>{getTN(selectedMatch.home, activeT)} vs {getTN(selectedMatch.away, activeT)}</Text>
                  {selectedMatch.status !== 'DONE' && (
                    <View style={{alignItems: 'flex-end'}}>
                      <Text style={{color: COLORS.primary, fontWeight: 'bold'}}>{Math.floor((selectedMatch.time || 0) / 60)}:{(selectedMatch.time || 0) % 60 < 10 ? '0' : ''}{(selectedMatch.time || 0) % 60}</Text>
                      <Text style={{color: COLORS.text, fontSize: 9}}>{selectedMatch.status}</Text>
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

                <ScrollView keyboardShouldPersistTaps="handled">
                  <Text style={styles.label}>Match Events</Text>
                  {(selectedMatch.events || []).map((ev, i) => (
                    <View key={i} style={styles.eventRow}>
                      <Text style={{color: '#fff', fontSize: 12, flex: 1}}>{ev.type} - {ev.player} ({getTN(ev.teamId, activeT)})</Text>
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
                        <Text style={{color: COLORS.text, fontSize: 10, fontWeight: 'bold'}}>{getTN(teamId, activeT)?.toUpperCase()} ACTIONS</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexDirection: 'row', marginTop: 5}}>
                          {activeT.teams.find(t => t.id === teamId)?.players.map(p => (
                            <View key={p.id} style={{marginRight: 10, gap: 5}}>
                              <Text style={{color: '#fff', fontSize: 10}}>{p.number}. {p.name}</Text>
                              <View style={{flexDirection: 'row', gap: 5}}>
                                <TouchableOpacity style={[styles.actionBtn, {width: 32, height: 32, borderRadius: 6}]} onPress={() => {
                                  const ev = { type: 'GOAL', player: p.name, teamId, id: Date.now() };
                                  const newEvents = [...(selectedMatch.events || []), ev];
                                  setSelectedMatch({ ...selectedMatch, events: newEvents });
                                  updateMatch(activeT.id, selectedMatch.id, '', '', newEvents);
                                }}><Icons.Zap color={COLORS.primary} size={12} /></TouchableOpacity>
                                <TouchableOpacity style={[styles.actionBtn, {borderColor: '#FFCC00', width: 32, height: 32, borderRadius: 6}]} onPress={() => {
                                  const ev = { type: 'YELLOW', player: p.name, teamId, id: Date.now() };
                                  const newEvents = [...(selectedMatch.events || []), ev];
                                  setSelectedMatch({ ...selectedMatch, events: newEvents });
                                  updateMatch(activeT.id, selectedMatch.id, '', '', newEvents);
                                }}><Icons.Square color="#FFCC00" size={12} fill="#FFCC00" /></TouchableOpacity>
                                <TouchableOpacity style={[styles.actionBtn, {borderColor: COLORS.danger, width: 32, height: 32, borderRadius: 6}]} onPress={() => {
                                  const ev = { type: 'RED', player: p.name, teamId, id: Date.now() };
                                  const newEvents = [...(selectedMatch.events || []), ev];
                                  setSelectedMatch({ ...selectedMatch, events: newEvents });
                                  updateMatch(activeT.id, selectedMatch.id, '', '', newEvents);
                                }}><Icons.Square color={COLORS.danger} size={12} fill={COLORS.danger} /></TouchableOpacity>
                                <TouchableOpacity style={[styles.actionBtn, {borderColor: COLORS.accent, width: 32, height: 32, borderRadius: 6}]} onPress={() => {
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

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{color: '#fff', marginTop: 15, fontSize: 16, fontWeight: 'bold'}}>DEEPPITCH ENGINE</Text>
          <Text style={{color: COLORS.muted, marginTop: 5, fontSize: 12}}>Processing your request securely...</Text>
        </View>
      )}

      {toastVisible && (
        <View style={styles.customToast}>
          <Text style={styles.customToastText}>{toastMessage}</Text>
        </View>
      )}

      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const StandingsTable = ({ data, resolveName }) => (
  <View style={styles.table}>
    <View style={styles.row}><Text style={[styles.cell, {flex: 2, textAlign: 'left'}]}>TEAM</Text><Text style={styles.cell}>P</Text><Text style={styles.cell}>GD</Text><Text style={styles.cell}>PTS</Text></View>
    {data.map(([id, s], i) => (
      <View key={i} style={[styles.row, {borderTopWidth: 1, borderColor: COLORS.border}]}>
        <Text style={[styles.cell, {flex: 2, textAlign: 'left', color: i < 2 ? COLORS.primary : COLORS.text}]}>{resolveName ? resolveName(id) : id}</Text>
        <Text style={styles.cell}>{s.p}</Text><Text style={styles.cell}>{s.gd}</Text><Text style={styles.cell}>{s.pts}</Text>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.card },
  logo: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -1 },
  
  // Hero Section
  hero: { padding: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroTitle: { fontSize: 32, fontWeight: '900', color: '#fff', lineHeight: 34, letterSpacing: -1 },
  heroSub: { color: COLORS.muted, fontSize: 14, marginTop: 8, fontWeight: '500' },
  heroIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.primary + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.primary + '30' },
  
  // Section Headings
  sectionLabel: { color: COLORS.muted, fontWeight: 'bold', marginBottom: 15, textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 },
  
  // Main Action Button
  createMainBtn: { backgroundColor: COLORS.card, padding: 20, borderRadius: 20, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, gap: 15 },
  createMainBtnIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  createMainBtnTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  createMainBtnSub: { color: COLORS.muted, fontSize: 12, marginTop: 2 },

  // Tournament Cards
  tCard: { backgroundColor: COLORS.card, padding: 16, borderRadius: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  tCardIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  tName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  tSub: { color: COLORS.muted, fontSize: 12 },
  typeTag: { backgroundColor: COLORS.secondary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: COLORS.border },
  typeTagText: { color: COLORS.primary, fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase' },

  // Empty State
  emptyState: { padding: 40, alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 24, marginTop: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: COLORS.border },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  emptySub: { color: COLORS.muted, textAlign: 'center', marginTop: 8, fontSize: 13, lineHeight: 18 },
  emptyBtn: { marginTop: 25, backgroundColor: COLORS.primary, paddingHorizontal: 30, paddingVertical: 12, borderRadius: 10 },
  emptyBtnText: { fontWeight: '900', color: '#000', fontSize: 12 },

  // Shared Styles
  label: { color: COLORS.primary, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase', fontSize: 12 },
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
  mTag: { fontSize: 8, color: COLORS.muted, fontWeight: '900', marginBottom: 2 },
  tabBar: { flexDirection: 'row', paddingHorizontal: 15, borderBottomWidth: 1, borderColor: COLORS.border },
  tab: { paddingVertical: 15, marginRight: 20, borderBottomWidth: 2, borderColor: 'transparent' },
  activeTab: { borderColor: COLORS.primary },
  tabText: { color: COLORS.muted, fontWeight: 'bold', fontSize: 12 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: COLORS.card, borderRadius: 8, marginBottom: 5 },
  statName: { color: '#fff', fontWeight: '500' },
  statVal: { color: COLORS.primary, fontWeight: 'bold' },
  scoreBadge: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, minWidth: 60, alignItems: 'center', backgroundColor: COLORS.secondary },
  scoreText: { color: COLORS.muted, fontSize: 13, fontWeight: '900' },
  eventRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondary, padding: 8, borderRadius: 6, marginBottom: 5 },
  actionBtn: { width: 32, height: 32, borderRadius: 6, borderWidth: 1, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  bracketNode: { backgroundColor: COLORS.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, marginVertical: 10, overflow: 'hidden' },
  bracketTeam: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, height: 40 },
  bracketTeamText: { color: '#fff', fontSize: 11, fontWeight: '600', flex: 1 },
  bracketScore: { color: COLORS.gold, fontWeight: 'bold', fontSize: 12, marginLeft: 5, width: 20, textAlign: 'right' },
  miniBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondary, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, gap: 5, borderWidth: 1, borderColor: COLORS.border },
  miniBtnText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  loadingOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: 'rgba(0,0,0,0.95)', // Make it a bit darker
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 9999 
  },
  customToast: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 10000,
  },
  customToastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});