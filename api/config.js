// Tarayıcının ihtiyaç duyduğu açık ayarlar ve hangi servislerin gerçekten bağlı olduğu.
const { SB, ANON, configured, send } = require("./_lib");

module.exports = (req, res) => {
  send(res, 200, {
    supabaseUrl: SB,
    supabaseAnonKey: ANON,
    ready: configured(),
    recognition: !!process.env.ANTHROPIC_API_KEY,
    model3d: !!process.env.MESHY_API_KEY,
  });
};
