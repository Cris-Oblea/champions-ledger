/* WHAT A POKEMON TURNS INTO, on the card, for BOTH kinds of turning.

   The Megas have had the full treatment for a while - a sprite in the strip,
   its own ink, a second number under every stat it moves, an arrow when the
   typing changes. The three forms that do the same thing from an ABILITY
   instead of a stone had none of it, and two of them are the ones whose base
   row is the most misleading number on the card (player, 2026-09-20: "faltan
   las formas de batalla (sobre todo las que cambian de stats como la de
   aegislash y la de palafin)... tambien son modificaciones in battle, como
   los megas").

   There are exactly three in Champions and this test says so, so that a
   regulation adding a fourth - a Wishiwashi, a Minior, an Eiscue, all of them
   one species away on the watchlist - fails here rather than shipping a card
   that quietly leaves it out. */
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = require("path").join(__dirname, "..") + "/";

let bad = 0;
const ok = (label, got, want) => {
  const good = String(got) === String(want);
  if (!good) bad++;
  console.log("  " + (good ? "OK  " : "FAIL") + "  " + label.padEnd(52) +
              got + (good ? "" : "   (esperado " + want + ")"));
};

const body = require("./harness.js").page(ROOT);
const stub = `<script>
window.supabase={createClient:function(){return{
 auth:{getSession:function(){return Promise.resolve({data:{session:null}});},
       onAuthStateChange:function(){},signInWithPassword:function(){},signOut:function(){}},
 from:function(){return{
   select:function(){return Promise.resolve({data:[],error:null});},
   upsert:function(){return Promise.resolve({error:null});},
   delete:function(){return {eq:function(){return Promise.resolve({error:null});}};}
 };},
 channel:function(){var c={on:function(){return c;},subscribe:function(){return c;}};return c;}
};}};
<\/script>`;
const vc = new VirtualConsole().on("jsdomError",
  e => { if (!/scrollTo/.test(e.message)) console.log("  jsdom: " + e.message); });
const dom = new JSDOM(body.replace("<head>", "<head>" + stub),
  {runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc});
const w = dom.window, d = w.document;

function card(name){
  w.go("find");
  const inp = d.getElementById("findName");
  inp.value = name;
  inp.dispatchEvent(new w.Event("input", {bubbles:true}));
  return [...d.querySelectorAll("#findOut .row.card")]
    .find(r => r.querySelector(".rname").textContent.indexOf(name) === 0);
}

setTimeout(() => {
  console.log("\n  cuantas formas de batalla tiene Champions");
  const bf = w.CHAMP.BFORMS;
  ok("las que mueven un numero", Object.keys(bf).sort().join(","),
     "Aegislash,Castform,Palafin");
  ok("y cada una dice que habilidad la provoca",
     Object.keys(bf).every(k => !!bf[k].by), true);

  console.log("\n  Aegislash: Stance Change le da 140 de ataque");
  const ae = card("Aegislash");
  ok("la card existe", !!ae, true);
  ok("el sprite de Blade esta en la tira",
     [...ae.querySelectorAll(".megapickey")].map(x => x.textContent).join(" "),
     "base blade");
  ok("y lleva su propia tinta, no la de una mega",
     !!ae.querySelector(".megapickey.mk-b"), true);
  ok("el ataque muestra el segundo numero",
     /140/.test(ae.querySelectorAll(".statline > div")[1].textContent), true);
  /* SIN CAJA. La habilidad que lo provoca ya esta arriba - las tres formas de
     batalla de Champions tienen una sola habilidad - asi que una caja mas
     repetiria la palabra debajo de si misma. */
  ok("Stance Change aparece una sola vez",
     (ae.textContent.match(/Stance Change/g) || []).length, 1);
  ok("y no la llama habilidad mega", /Mega ability/.test(ae.textContent), false);

  console.log("\n  Palafin: Zero to Hero, 70 -> 160");
  const pa = card("Palafin");
  ok("el sprite de Hero esta en la tira",
     [...pa.querySelectorAll(".megapickey")].map(x => x.textContent).join(" "),
     "base hero");
  ok("el ataque muestra 160",
     /160/.test(pa.querySelectorAll(".statline > div")[1].textContent), true);
  ok("y el BST sube", /457\s*→\s*650/.test(pa.textContent.replace(/\s+/g," ")), true);

  console.log("\n  Castform: Forecast le cambia el tipo tres veces");
  const ca = card("Castform");
  ok("los tres sprites estan",
     [...ca.querySelectorAll(".megapickey")].map(x => x.textContent).join(" "),
     "base sunny rainy snowy");
  ok("y las tres flechas nombran su forma",
     [...ca.querySelectorAll(".megato")].map(x => x.textContent.trim()).join(" "),
     "→ sunny → rainy → snowy");
  ["Fire", "Water", "Ice"].forEach(t => ok("chip de " + t,
     [...ca.querySelectorAll(".rmeta .t")].some(x => x.textContent === t), true));

  console.log("\n  un Pokemon sin forma de batalla no cambia en nada");
  const ga = card("Garchomp");
  ok("Garchomp no tiene tinta de forma de batalla",
     !!ga.querySelector(".mk-b"), false);

  console.log(bad ? "\n  " + bad + " FALLAN\n" : "\n  todo bien\n");
  process.exit(bad ? 1 : 0);
}, 900);
