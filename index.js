// ==================== Configuration ====================

const BOT_WEBHOOK = "/webhook";

// ==================== Event Listener ====================

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === BOT_WEBHOOK) {
    return handleWebhook(request, env);
  }

  if (url.pathname === '/registerWebhook') {
    return registerWebhook(request, env);
  }

  return new Response('Not Found', { status: 404 });
}

// ==================== Webhook Handlers ====================

async function handleWebhook(request, env) {
  const update = await request.json();

  if (update.message) {
    await processMessage(update.message, env);
  }

  return new Response('OK');
}

async function registerWebhook(request, env) {
  const url = new URL(request.url);
  const webhookUrl = `${url.protocol}//${url.hostname}${BOT_WEBHOOK}`;

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl
    })
  });

  return new Response(await response.text(), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// ==================== Message Processing ====================

async function processMessage(message, env) {
  const userId = message.chat.id;
  const recipientId = env.BALE_CHAT_ID;

  // Check if user is in mapping
  if (!recipientId) {
    await sendMessage(userId, message.message_id, '❌ You are not authorized to use this bot.', env);
    return;
  }

  // Handle /start command
  if (message.text && message.text === '/start') {
    const welcomeText = '👋 Welcome!\n\nSend a file to forward to the recipient.\n\n📁 Max file size: 20 MB';
    await sendMessage(userId, message.message_id, welcomeText, env);
    return;
  }

  // Handle file upload
  if (message.document) {
    await handleFileTransfer(userId, recipientId, message.document, env);
    return;
  }

  if (message.photo) {
    await handlePhotoTransfer(userId, recipientId, message.photo, env);
    return;
  }

  if (message.video) {
    await handleVideoTransfer(userId, recipientId, message.video, env);
    return;
  }

  if (message.audio) {
    await handleAudioTransfer(userId, recipientId, message.audio, env);
    return;
  }

  await sendMessage(userId, message.message_id, '❌ Please send a file.', env);
}

// ==================== File Transfer Handlers ====================

async function handleFileTransfer(senderId, recipientId, document, env) {
  if (document.file_size > MAX_FILE_SIZE) {
    await sendMessage(senderId, null, `❌ Error: File size (${formatSize(document.file_size)}) exceeds max limit (20 MB).`, env);
    return;
  }

  try {
    await sendMessage(senderId, null, '⏳ Processing...', env);

    const file = await getFile(document.file_id, env);
    const fileBuffer = await downloadFile(file.file_path, env);

    const formData = new FormData();
    formData.append('chat_id', recipientId);
    formData.append('document', new Blob([fileBuffer]), document.file_name || 'file');

    const response = await fetch(`https://tapi.bale.ai/bot${env.BALE_TOKEN}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.ok) {
      await sendMessage(senderId, null, '✅ File sent successfully.', env);
    } else {
      await sendMessage(senderId, null, `❌ Error: ${result.description}`, env);
    }
  } catch (error) {
    console.error('Error transferring file:', error);
    await sendMessage(senderId, null, '❌ Error while transferring file.', env);
  }
}

async function handlePhotoTransfer(senderId, recipientId, photos, env) {
  try {
    await sendMessage(senderId, null, '⏳ Processing...', env);

    const largestPhoto = photos[photos.length - 1];
    const file = await getFile(largestPhoto.file_id, env);
    const fileBuffer = await downloadFile(file.file_path, env);

    const formData = new FormData();
    formData.append('chat_id', recipientId);
    formData.append('photo', new Blob([fileBuffer]), 'photo.jpg');

    const response = await fetch(`https://tapi.bale.ai/bot${env.BALE_TOKEN}/sendPhoto`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.ok) {
      await sendMessage(senderId, null, '✅ Photo sent successfully.', env);
    } else {
      await sendMessage(senderId, null, `❌ Error: ${result.description}`, env);
    }
  } catch (error) {
    console.error('Error transferring photo:', error);
    await sendMessage(senderId, null, '❌ Error while transferring photo.', env);
  }
}

async function handleVideoTransfer(senderId, recipientId, video, env) {
  if (video.file_size > MAX_FILE_SIZE) {
    await sendMessage(senderId, null, `❌ Error: Video size (${formatSize(video.file_size)}) exceeds max limit.`, env);
    return;
  }

  try {
    await sendMessage(senderId, null, '⏳ Processing...', env);

    const file = await getFile(video.file_id, env);
    const fileBuffer = await downloadFile(file.file_path, env);

    const formData = new FormData();
    formData.append('chat_id', recipientId);
    formData.append('video', new Blob([fileBuffer]), 'video.mp4');
    formData.append('supports_streaming', 'true');

    const response = await fetch(`https://tapi.bale.ai/bot${env.BALE_TOKEN}/sendVideo`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.ok) {
      await sendMessage(senderId, null, '✅ Video sent successfully.', env);
    } else {
      await sendMessage(senderId, null, `❌ Error: ${result.description}`, env);
    }
  } catch (error) {
    console.error('Error transferring video:', error);
    await sendMessage(senderId, null, '❌ Error while transferring video.', env);
  }
}

async function handleAudioTransfer(senderId, recipientId, audio, env) {
  if (audio.file_size > MAX_FILE_SIZE) {
    await sendMessage(senderId, null, `❌ Error: Audio file size exceeds max limit.`, env);
    return;
  }

  try {
    await sendMessage(senderId, null, '⏳ Processing...', env);

    const file = await getFile(audio.file_id, env);
    const fileBuffer = await downloadFile(file.file_path, env);

    const formData = new FormData();
    formData.append('chat_id', recipientId);
    formData.append('audio', new Blob([fileBuffer]), audio.file_name || 'audio.mp3');

    const response = await fetch(`https://tapi.bale.ai/bot${env.BALE_TOKEN}/sendAudio`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.ok) {
      await sendMessage(senderId, null, '✅ Audio sent successfully.', env);
    } else {
      await sendMessage(senderId, null, `❌ Error: ${result.description}`, env);
    }
  } catch (error) {
    console.error('Error transferring audio:', error);
    await sendMessage(senderId, null, '❌ Error while transferring audio.', env);
  }
}

// ==================== Telegram API Methods ====================

async function sendMessage(chatId, replyId, text, env) {
  const params = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown'
  };

  if (replyId) {
    params.reply_to_message_id = replyId;
  }

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
}

async function getFile(fileId, env) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  const data = await response.json();
  return data.result;
}

async function downloadFile(filePath, env) {
  const response = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`);
  return await response.arrayBuffer();
}

// ==================== Utility Functions ====================

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
