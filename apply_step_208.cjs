const fs = require('fs');
const transcriptPath = 'C:\\Users\\Ahmet\\.gemini\\antigravity\\brain\\0d4ff27c-fc26-49ec-b873-5fe202a0d419\\.system_generated\\logs\\transcript.jsonl';
const targetPath = 'src/pages/DocumentsPage.tsx';

const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');

const step = JSON.parse(lines[207]);
const toolCall = step.tool_calls[0];
const chunks = typeof toolCall.args.ReplacementChunks === 'string' 
  ? JSON.parse(toolCall.args.ReplacementChunks) 
  : toolCall.args.ReplacementChunks;

console.log(`Loaded ${chunks.length} chunks from transcript step 208.`);

let content = fs.readFileSync(targetPath, 'utf8');

// Normalize line endings to \n
content = content.replace(/\r\n/g, '\n');

chunks.forEach((chunk, index) => {
  const targetText = chunk.TargetContent.replace(/\r\n/g, '\n');
  const replacementText = chunk.ReplacementContent.replace(/\r\n/g, '\n');
  
  if (content.includes(targetText)) {
    content = content.replace(targetText, replacementText);
    console.log(`Chunk ${index + 1} applied successfully.`);
  } else {
    console.log(`Error: Chunk ${index + 1} TargetContent not found in file.`);
  }
});

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Successfully wrote DocumentsPage.tsx!');
