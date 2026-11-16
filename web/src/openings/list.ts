// Well-known openings as plain data. The short entries are not useful to
// load, but they let the first moves of a study be named.
export interface Opening {
  name: string;
  moves: string; // standard notation from the starting position
}

export const OPENINGS: Opening[] = [
  { name: "King's Pawn Game", moves: "e4" },
  { name: "Queen's Pawn Game", moves: "d4" },
  { name: "English Opening", moves: "c4" },
  { name: "Réti Opening", moves: "Nf3" },

  { name: "Open Game", moves: "e4 e5" },
  { name: "Italian Game", moves: "e4 e5 Nf3 Nc6 Bc4" },
  { name: "Giuoco Piano", moves: "e4 e5 Nf3 Nc6 Bc4 Bc5" },
  { name: "Two Knights Defence", moves: "e4 e5 Nf3 Nc6 Bc4 Nf6" },
  { name: "Ruy Lopez", moves: "e4 e5 Nf3 Nc6 Bb5" },
  { name: "Ruy Lopez, Morphy Defence", moves: "e4 e5 Nf3 Nc6 Bb5 a6" },
  { name: "Ruy Lopez, Berlin Defence", moves: "e4 e5 Nf3 Nc6 Bb5 Nf6" },
  { name: "Scotch Game", moves: "e4 e5 Nf3 Nc6 d4" },
  { name: "Petrov's Defence", moves: "e4 e5 Nf3 Nf6" },
  { name: "King's Gambit", moves: "e4 e5 f4" },
  { name: "Vienna Game", moves: "e4 e5 Nc3" },

  { name: "Sicilian Defence", moves: "e4 c5" },
  { name: "Sicilian Defence, Najdorf Variation", moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6" },
  { name: "Sicilian Defence, Dragon Variation", moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6" },
  {
    name: "Sicilian Defence, Sveshnikov Variation",
    moves: "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5",
  },
  { name: "French Defence", moves: "e4 e6" },
  { name: "French Defence, Advance Variation", moves: "e4 e6 d4 d5 e5" },
  { name: "French Defence, Winawer Variation", moves: "e4 e6 d4 d5 Nc3 Bb4" },
  { name: "Caro-Kann Defence", moves: "e4 c6" },
  { name: "Caro-Kann Defence, Advance Variation", moves: "e4 c6 d4 d5 e5" },
  { name: "Scandinavian Defence", moves: "e4 d5" },
  { name: "Alekhine's Defence", moves: "e4 Nf6" },
  { name: "Pirc Defence", moves: "e4 d6 d4 Nf6 Nc3 g6" },

  { name: "Queen's Gambit", moves: "d4 d5 c4" },
  { name: "Queen's Gambit Declined", moves: "d4 d5 c4 e6" },
  { name: "Queen's Gambit Accepted", moves: "d4 d5 c4 dxc4" },
  { name: "Slav Defence", moves: "d4 d5 c4 c6" },
  { name: "London System", moves: "d4 d5 Bf4" },
  { name: "Indian Defence", moves: "d4 Nf6" },
  { name: "King's Indian Defence", moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6" },
  { name: "Grünfeld Defence", moves: "d4 Nf6 c4 g6 Nc3 d5" },
  { name: "Nimzo-Indian Defence", moves: "d4 Nf6 c4 e6 Nc3 Bb4" },
  { name: "Queen's Indian Defence", moves: "d4 Nf6 c4 e6 Nf3 b6" },
  { name: "Catalan Opening", moves: "d4 Nf6 c4 e6 g3" },
  { name: "Dutch Defence", moves: "d4 f5" },
];
