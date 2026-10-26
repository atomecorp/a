// The subscription video services of Divertissement › Vidéo › Films & séries: the
// ones a user declares (Réglages › Mots de passe et clés › Vidéo), the server's
// catalogue filter (server/ws_video_catalog.js) and the internal page a service
// opens on (eVe/domains/media/streaming_view.js). Shared by the server and the client.
//
// - `tmdb`: the service's TMDB watch-provider ids in France (its offers with ads included);
// - `logo`: its TMDB logo file (tmdbImage('w92', logo));
// - `home`: its own page, where one subscribes and signs in; `search`: its own search of a
//   title (a TMDB id is never a service's id: a title is only ever searched), '' when it has
//   no public one (its home opens and the person searches there).
// The addresses are the services' public ones, not yet tried inside atome (26 Oct. 2026).
export const STREAMING_SERVICES = Object.freeze([
    { key: 'netflix', label: 'Netflix', tmdb: [8, 1796], logo: '/rK1KljqmbvO9HQa1PBFLILWah72.png',
        home: 'https://www.netflix.com/', search: 'https://www.netflix.com/search?q=' },
    { key: 'disney', label: 'Disney+', tmdb: [337], logo: '/5eZ872CghnHFLB1j8grszbrx0dx.png',
        home: 'https://www.disneyplus.com/', search: 'https://www.disneyplus.com/search?q=' },
    { key: 'prime', label: 'Prime Video', tmdb: [119, 2100], logo: '/gMZdpavHmxFNnLpMHwVxfqeux2g.png',
        home: 'https://www.primevideo.com/', search: 'https://www.primevideo.com/search/?phrase=' },
    { key: 'canal', label: 'CANAL+', tmdb: [381, 345], logo: '/gliWKhLJVdm7QwL1braBCRko5dx.png',
        home: 'https://www.canalplus.com/', search: 'https://www.canalplus.com/recherche/?q=' },
    { key: 'paramount', label: 'Paramount+', tmdb: [531, 2303], logo: '/pkx3klJlwW5JdtaulvDx6hDNtch.png',
        home: 'https://www.paramountplus.com/', search: 'https://www.paramountplus.com/search/?q=' },
    { key: 'apple', label: 'Apple TV+', tmdb: [350], logo: '/9icYBfYFcwgCbky5VdGUIKJ4C5i.png',
        home: 'https://tv.apple.com/', search: 'https://tv.apple.com/search?term=' },
    { key: 'max', label: 'HBO Max', tmdb: [1899], logo: '/skypuy7SXuugIQeYg0IglmzoKaS.png',
        home: 'https://www.hbomax.com/', search: 'https://play.hbomax.com/search?q=' },
    { key: 'crunchyroll', label: 'Crunchyroll', tmdb: [283], logo: '/uFL3c4Cq8M6WoLymlC5Y8bmGytV.png',
        home: 'https://www.crunchyroll.com/', search: 'https://www.crunchyroll.com/search?q=' },
    { key: 'mubi', label: 'MUBI', tmdb: [11], logo: '/k7iSlvgWzZuO4zU5PcBjhABMuia.png',
        home: 'https://mubi.com/', search: 'https://mubi.com/search/films?query=' },
    { key: 'adn', label: 'ADN', tmdb: [415], logo: '/lqW5wpRdZQrAPiHv1nZo3j8t4BW.png',
        home: 'https://animationdigitalnetwork.com/', search: 'https://animationdigitalnetwork.com/search?q=' },
    { key: 'shadowz', label: 'Shadowz', tmdb: [513], logo: '/4Hmt479nSu8j4JIFDu6WPqsc6AT.png',
        home: 'https://www.shadowz.fr/', search: 'https://www.shadowz.fr/search?q=' },
    { key: 'molotov', label: 'Molotov', tmdb: [1967], logo: '/g8P4BJ2Wrya0VkbGUxBoUqpXtSs.png',
        home: 'https://www.molotov.tv/', search: '' }
].map(Object.freeze));

export const streamingService = key => STREAMING_SERVICES.find(service => service.key === key) || null;
// The service a TMDB provider id belongs to (null: a free channel, a store, one not listed).
export const streamingServiceOfProvider = id => STREAMING_SERVICES.find(service => service.tmdb.includes(Number(id))) || null;
