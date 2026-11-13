// Lists one folder for the Files tree on Windows: `node -e LIST <folder>` prints [{name, dir}] as JSON.
// node starts in ~60 ms; Windows PowerShell needs 1-2 s, which made every folder expand lag.
// Skips .git, stops after 501 entries (the tree shows 500 and says it is limited), and a link counts
// as a folder only when its target is one (a dangling link is a file). Errors print just the message.
export const LIST = "const fs=require('fs'),p=process.argv[1],out=[];try{for(const e of fs.readdirSync(p,{withFileTypes:true})){if(e.name==='.git')continue;let dir=e.isDirectory();if(!dir&&e.isSymbolicLink())try{dir=fs.statSync(p+'/'+e.name).isDirectory()}catch{}out.push({name:e.name,dir});if(out.length>500)break}}catch(e){console.error(e.message);process.exit(1)}console.log(JSON.stringify(out))";
