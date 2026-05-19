// Utility to generate LRX exp with lyrics and timecodes
export function exportSongsToLRX(songSummaries, lyricsLibrary, options = {}) {
  const { midiAssignments, midiSpecialAssignments } = resolveMidiState(options);
  const payload = {
    version: "1.1",
    exportDate: new Date().toISOString(),
    totalSongs: songSummaries.length,
    songs: songSummaries.map(summary => {
      const song = lyricsLibrary.getSongById(summary.songId);
      let lines = [];
      if (song && song.lines && song.lines.length > 0) {
        lines = song.lines.map(line => ({
          time: typeof line.time === 'number' ? line.time : 0,
          text: line.text || ''
        }));
      }
      // Ajout d'un log pour debug
      return {
        songId: summary.songId,
        title: song?.metadata?.title || summary.title || '',
        artist: song?.metadata?.artist || summary.artist || '',
        album: song?.metadata?.album || summary.album || '',
        audioPath: summary.audioPath,
        syncData: summary.syncData || null,
        lines: lines
      };
    })
  };

  if (midiAssignments && Object.keys(midiAssignments).length > 0) {
    payload.midiAssignments = midiAssignments;
  }
  if (midiSpecialAssignments && Object.keys(midiSpecialAssignments).length > 0) {
    payload.midiSpecialAssignments = midiSpecialAssignments;
  }

  return payload;
}

// Exemple d'utilisation :
// const lrxData = exportSongsToLRX(allSongs, LyricsLibrary);
// const lrxJson = JSON.stringify(lrxData, null, 2);

function resolveMidiState(options) {
  if (options && (options.midiAssignments || options.midiSpecialAssignments)) {
    return {
      midiAssignments: options.midiAssignments || null,
      midiSpecialAssignments: options.midiSpecialAssignments || null
    };
  }

  if (typeof window !== 'undefined') {
    const midiUtils = window.Lyrix?.midiUtilities;
    if (midiUtils) {
      const assignments = typeof midiUtils.getAssignmentSnapshot === 'function'
        ? midiUtils.getAssignmentSnapshot()
        : null;
      const special = typeof midiUtils.getSpecialAssignmentSnapshot === 'function'
        ? midiUtils.getSpecialAssignmentSnapshot()
        : null;
      return {
        midiAssignments: assignments,
        midiSpecialAssignments: special
      };
    }
  }

  return { midiAssignments: null, midiSpecialAssignments: null };
}
