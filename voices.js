/* =========================================================
   ジャービス：声の設定ファイル
   ---------------------------------------------------------
   ・speaker    … VOICEVOXの話者ID（声の種類）
   ・speedScale … 話す速さ（1.0が普通。0.5〜2.0）
   ・pitchScale … 声の高さ（0.0が普通。-0.15〜0.15くらい）
   ・label      … メモ用（どの声か）。動作には影響しません

   ここを書き換えると初期値が変わります。
   画面の「設定」→「声の設定」で変えた内容は、この端末に保存され、
   こちらより優先されます（「初期値に戻す」でここの値に戻ります）。

   ※話者IDはVOICEVOXのバージョンで変わることがあります。
     うまく鳴らないときは設定画面の一覧から選び直してください。
   ========================================================= */
window.VOICE_CONFIG = {
  // VOICEVOXエンジンの場所（ふつうは変えなくてOK）
  engineUrl: "http://localhost:50021",

  members: {
    "ジャービス": { speaker: 11, speedScale: 1.0,  pitchScale: 0.0,   label: "玄野武宏（ノーマル）" },
    "スティーブ": { speaker: 12, speedScale: 1.0,  pitchScale: 0.0,   label: "白上虎太郎（ふつう）" },
    "ブルース":   { speaker: 52, speedScale: 0.95, pitchScale: 0.0,   label: "雀松朱司（ノーマル）" },
    "ナターシャ": { speaker: 14, speedScale: 1.0,  pitchScale: -0.02, label: "冥鳴ひまり（ノーマル）" },
    "トニー":     { speaker: 21, speedScale: 1.15, pitchScale: 0.02,  label: "剣崎雌雄（ノーマル）" },
    "トール":     { speaker: 13, speedScale: 0.88, pitchScale: -0.06, label: "青山龍星（ノーマル）" },
    "ペッパー":   { speaker: 2,  speedScale: 1.1,  pitchScale: 0.03,  label: "四国めたん（ノーマル）" },
    "ビジョン":   { speaker: 53, speedScale: 1.0,  pitchScale: 0.0,   label: "麒ヶ島宗麟（ノーマル）" },
    "シュリ":     { speaker: 3,  speedScale: 1.15, pitchScale: 0.04,  label: "ずんだもん（ノーマル）" }
  }
};
