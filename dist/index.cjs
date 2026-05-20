module.exports = async function piTalkExtension(pi) {
  const extension = await import('./index.mjs');
  return (extension.default ?? extension)(pi);
};
