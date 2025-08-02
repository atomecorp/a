// Utilitaire pour générer l'export LRX avec les paroles et timecodes
export function exportSongsToLRX(songSummaries, lyricsLibrary) {
  return {
    version: "1.0",
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
      console.log('EXPORT LRX', summary.songId, 'lines:', lines.length, lines.slice(0, 3));
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
}

// Exemple d'utilisation :
// const lrxData = exportSongsToLRX(allSongs, LyricsLibrary);
// const lrxJson = JSON.stringify(lrxData, null, 2);
