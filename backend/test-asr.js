const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const videoId = '8B1rN1rnTiU';
const url = `https://www.youtube.com/watch?v=${videoId}`;

console.log('Starting ASR test for video:', videoId);

const tmpDir = os.tmpdir();
const audioTmpDir = path.join(tmpDir, `test_ytdlp_${videoId}_${Date.now()}`);
const outTemplate = path.join(audioTmpDir, `${videoId}.%(ext)s`);
const mp3Path = path.join(tmpDir, `test_full_${videoId}.mp3`);

(async () => {
  try {
    console.log('\n1. Creating temp directory:', audioTmpDir);
    if (!fs.existsSync(audioTmpDir)) {
      fs.mkdirSync(audioTmpDir, { recursive: true });
    }
    console.log('   ✓ Directory created');

    console.log('\n2. Downloading audio with yt-dlp...');
    const ytDlp = new YTDlpWrap();
    await ytDlp.execPromise([
      url,
      '--quiet',
      '--no-warnings',
      '--no-playlist',
      '-f',
      'bestaudio',
      '-o',
      outTemplate,
    ]);
    console.log('   ✓ Download complete');

    console.log('\n3. Finding downloaded file...');
    const files = fs.readdirSync(audioTmpDir);
    console.log('   Files in temp dir:', files);
    const audioFile = files.find(f => f.startsWith(videoId + '.'));
    if (!audioFile) {
      throw new Error('yt-dlp did not produce an audio file');
    }
    const audioPath = path.join(audioTmpDir, audioFile);
    const stats = fs.statSync(audioPath);
    console.log(`   ✓ Found: ${audioFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

    console.log('\n4. Converting to MP3 with ffmpeg (first 60 seconds)...');
    await new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .audioCodec('libmp3lame')
        .format('mp3')
        .duration(60)
        .on('error', (err) => {
          console.error('   ✗ ffmpeg error:', err.message);
          reject(err);
        })
        .on('end', () => {
          console.log('   ✓ Conversion complete');
          resolve();
        })
        .save(mp3Path);
    });

    const mp3Stats = fs.statSync(mp3Path);
    console.log(`   ✓ MP3 created: ${(mp3Stats.size / 1024 / 1024).toFixed(2)} MB`);

    console.log('\n5. Sending to ASR server...');
    const fd = new FormData();
    fd.append('file', fs.createReadStream(mp3Path));
    fd.append('response_format', 'verbose_json');
    fd.append('language', 'auto');

    const asrUrl = 'http://asr-server:8000/transcribe';
    console.log('   ASR URL:', asrUrl);
    
    const { data } = await axios.post(asrUrl, fd, {
      headers: fd.getHeaders(),
      timeout: 120000,
    });

    console.log('\n6. ASR Response:');
    console.log('   Segments count:', data?.segments?.length || 0);
    if (data?.segments?.length > 0) {
      console.log('   First 3 segments:');
      for (let i = 0; i < Math.min(3, data.segments.length); i++) {
        console.log(`   [${i}]:`, data.segments[i]);
      }
    }
    
    console.log('\n✅ ASR TEST SUCCESSFUL');
    console.log('Total segments:', data?.segments?.length || 0);

  } catch (error) {
    console.error('\n❌ ASR TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(audioTmpDir)) {
        fs.rmSync(audioTmpDir, { recursive: true, force: true });
        console.log('\n🧹 Cleaned up temp directory');
      }
      if (fs.existsSync(mp3Path)) {
        fs.unlinkSync(mp3Path);
        console.log('🧹 Cleaned up MP3 file');
      }
    } catch (e) {
      console.error('Cleanup error:', e.message);
    }
  }
})();
