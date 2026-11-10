(() => {
  const text = {
    en: {
      title: "AiSphere couldn't start",
      eyebrow: 'Startup issue',
      intro: 'Something went wrong while AiSphere was starting. You can copy the diagnostic details to share with support.',
      details: 'Error details',
      badge: 'Diagnostic info',
      hint: 'AiSphere will close when you choose Exit.',
      copy: 'Copy details',
      copied: 'Copied to clipboard',
      copyFailed: 'Could not copy details. Select and copy the text above.',
      exit: 'Exit AiSphere',
      close: 'Exit AiSphere',
    },
    zh: {
      title: 'AiSphere 无法启动',
      eyebrow: '启动错误',
      intro: 'AiSphere 启动时遇到问题。您可以复制诊断信息并发送给支持团队。',
      details: '错误详情',
      badge: '诊断信息',
      hint: '点击“退出”后 AiSphere 将关闭。',
      copy: '复制详情',
      copied: '已复制到剪贴板',
      copyFailed: '复制失败，请选择并复制上方文本。',
      exit: '退出 AiSphere',
      close: '退出 AiSphere',
    },
  };

  const parameters = new URLSearchParams(location.search);
  const language = parameters.get('language') === 'zh' ? 'zh' : 'en';
  const labels = text[language];
  const setText = (id, value) => {
    document.getElementById(id).textContent = value;
  };

  document.documentElement.lang = language;
  document.title = labels.title;
  setText('title', labels.title);
  setText('eyebrow', labels.eyebrow);
  setText('intro', labels.intro);
  setText('detail-label', labels.details);
  setText('badge', labels.badge);
  setText('hint', labels.hint);
  setText('copy-label', labels.copy);
  setText('exit-label', labels.exit);
  document.getElementById('close').setAttribute('aria-label', labels.close);
  document.getElementById('close').setAttribute('title', labels.close);
  document.getElementById('details').setAttribute('aria-label', labels.details);

  try {
    const encoded = new URLSearchParams(location.search).get('data');
    const bytes = Uint8Array.from(atob(encoded || ''), (character) => character.charCodeAt(0));
    document.getElementById('details').textContent = new TextDecoder().decode(bytes) || labels.title;
  } catch {
    document.getElementById('details').textContent = labels.title;
  }

  document.getElementById('copy').addEventListener('click', async () => {
    const feedback = document.getElementById('feedback');
    try {
      await window.startupError.copy();
      feedback.textContent = labels.copied;
    } catch {
      feedback.textContent = labels.copyFailed;
    }
  });

  const exit = () => {
    void window.startupError.exit();
  };
  document.getElementById('exit').addEventListener('click', exit);
  document.getElementById('close').addEventListener('click', exit);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') exit();
  });
})();
