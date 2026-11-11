import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildNpcTrainerTeam,
  trainerPresets,
} from "../src/lib/trainerBattle/kantoPresets";
import { getCurrentHp, getMaxHp } from "../src/lib/pokemonStats";
import {
  createTrainerBattleSession,
  trainerSetupErrors,
  validTrainerBattleSession,
} from "../src/lib/trainerBattle/model";
import { startTrainerBattle } from "../src/lib/trainerBattle/engine";

// Independent, compact transcription of the requested roster. In particular,
// repeated species have different slots/moves and lab moves are intentional.
const expected: Record<string, string[]> = {
  "kanto-brock": [
    "Geodude@12:tackle,defensecurl,mudsport,rocktomb",
    "Onix@14:tackle,bind,harden,rocktomb",
  ],
  "kanto-misty": [
    "Staryu@18:tackle,harden,recover,waterpulse",
    "Starmie@21:swift,recover,waterpulse,rapidspin",
  ],
  "kanto-surge": [
    "Voltorb@21:screech,shockwave,sonicboom,quickattack",
    "Pikachu@18:shockwave,thunderwave,quickattack,doubleteam",
    "Raichu@24:shockwave,thunderwave,quickattack,doubleteam",
  ],
  "kanto-erika": [
    "Victreebel@29:stunspore,acid,poisonpowder,gigadrain",
    "Tangela@24:poisonpowder,constrict,ingrain,gigadrain",
    "Vileplume@29:sleeppowder,acid,moonlight,gigadrain",
  ],
  "kanto-koga": [
    "Koffing@37:selfdestruct,sludge,smokescreen,toxic",
    "Muk@39:acid,minimize,sludge,toxic",
    "Koffing@37:sludge,smokescreen,toxic,explosion",
    "Weezing@43:tackle,sludge,smokescreen,toxic",
  ],
  "kanto-sabrina": [
    "Kadabra@38:psybeam,reflect,futuresight,calmmind",
    "Mr. Mime@37:barrier,psybeam,batonpass,calmmind",
    "Venomoth@38:poisonpowder,psybeam,gust,supersonic",
    "Alakazam@43:psybeam,recover,futuresight,calmmind",
  ],
  "kanto-blaine": [
    "Growlithe@42:bite,roar,takedown,fireblast",
    "Ponyta@40:tailwhip,stomp,growl,fireblast",
    "Rapidash@42:firespin,stomp,bounce,fireblast",
    "Arcanine@47:bite,roar,extremespeed,fireblast",
  ],
  "kanto-giovanni": [
    "Rhyhorn@45:takedown,scaryface,earthquake,rockblast",
    "Dugtrio@42:mudslap,sandtomb,slash,earthquake",
    "Nidoqueen@44:poisonsting,bodyslam,crunch,earthquake",
    "Nidoking@45:thrash,doublekick,poisonsting,earthquake",
    "Rhyhorn@50:takedown,scaryface,earthquake,rockblast",
  ],
  "kanto-lorelei": [
    "Dewgong@52:surf,hail,safeguard,icebeam",
    "Cloyster@51:spikes,protect,hail,dive",
    "Slowbro@52:surf,icebeam,yawn,amnesia",
    "Jynx@54:icepunch,doubleslap,lovelykiss,attract",
    "Lapras@54:surf,icebeam,bodyslam,confuseray",
  ],
  "kanto-bruno": [
    "Onix@51:earthquake,rocktomb,irontail,roar",
    "Hitmonchan@53:skyuppercut,machpunch,rocktomb,counter",
    "Hitmonlee@53:megakick,foresight,brickbreak,facade",
    "Onix@54:doubleedge,irontail,earthquake,sandtomb",
    "Machamp@56:crosschop,bulkup,rocktomb,scaryface",
  ],
  "kanto-agatha": [
    "Gengar@54:confuseray,shadowpunch,doubleteam,toxic",
    "Golbat@54:confuseray,bite,aircutter,poisonfang",
    "Haunter@53:meanlook,curse,hypnosis,dreameater",
    "Arbok@56:bite,sludgebomb,screech,irontail",
    "Gengar@58:shadowball,sludgebomb,hypnosis,nightmare",
  ],
  "kanto-lance": [
    "Gyarados@56:bite,dragonrage,twister,hyperbeam",
    "Dragonair@54:safeguard,outrage,dragonrage,hyperbeam",
    "Dragonair@54:safeguard,outrage,thunderwave,hyperbeam",
    "Aerodactyl@58:ancientpower,wingattack,scaryface,hyperbeam",
    "Dragonite@60:safeguard,outrage,wingattack,hyperbeam",
  ],
  "kanto-rival-lab-grass": ["Charmander@5:ember,growl"],
  "kanto-rival-lab-fire": ["Squirtle@5:watergun,tailwhip"],
  "kanto-rival-lab-water": ["Bulbasaur@5:vinewhip,growl"],
  "kanto-rival-champion-grass": [
    "Pidgeot@59:aerialace,featherdance,sandattack,whirlwind",
    "Alakazam@57:psychic,futuresight,recover,reflect",
    "Rhydon@59:takedown,earthquake,scaryface,rocktomb",
    "Gyarados@59:hydropump,dragonrage,bite,thrash",
    "Exeggutor@61:gigadrain,eggbomb,sleeppowder,lightscreen",
    "Charizard@63:fireblast,aerialace,slash,firespin",
  ],
  "kanto-rival-champion-fire": [
    "Pidgeot@59:aerialace,featherdance,sandattack,whirlwind",
    "Alakazam@57:psychic,futuresight,recover,reflect",
    "Rhydon@59:takedown,earthquake,scaryface,rocktomb",
    "Exeggutor@59:gigadrain,eggbomb,sleeppowder,lightscreen",
    "Arcanine@61:extremespeed,flamethrower,roar,bite",
    "Blastoise@63:hydropump,raindance,skullbash,bite",
  ],
  "kanto-rival-champion-water": [
    "Pidgeot@59:aerialace,featherdance,sandattack,whirlwind",
    "Alakazam@57:psychic,futuresight,recover,reflect",
    "Rhydon@59:takedown,earthquake,scaryface,rocktomb",
    "Arcanine@59:extremespeed,flamethrower,roar,bite",
    "Gyarados@61:hydropump,dragonrage,bite,thrash",
    "Venusaur@63:solarbeam,growth,synthesis,sunnyday",
  ],
};

test("Kanto contains exactly the requested 18 rosters and movesets", () => {
  assert.equal(trainerPresets.length, 18);
  assert.deepEqual(
    trainerPresets.map((preset) => preset.id).sort(),
    Object.keys(expected).sort(),
  );
  assert.equal(
    trainerPresets.filter((preset) => preset.category === "gym").length,
    8,
  );
  assert.equal(
    trainerPresets.filter((preset) => preset.category === "elite-four").length,
    4,
  );
  for (const preset of trainerPresets) {
    assert.equal(preset.region, "kanto");
    assert.deepEqual(
      preset.team.pokemons.map(
        ({ pokemon, moves }) =>
          `${pokemon.name}@${pokemon.level}:${moves!.map((move) => move.name).join(",")}`,
      ),
      expected[preset.id],
      preset.id,
    );
    assert.equal(
      new Set(preset.team.pokemons.map((member) => member.captureId)).size,
      preset.team.pokemons.length,
    );
    assert.equal(
      preset.team.activeCaptureId,
      preset.team.pokemons[0].captureId,
    );
    if (preset.category === "rival")
      assert.ok(preset.id.endsWith(`-${preset.starterType}`));
  }
});

test("NPC generation scales HP, resets conditions and returns an independent healthy team", () => {
  for (const preset of trainerPresets) {
    for (const multiplier of [1, 1.3, 2]) {
      const team = buildNpcTrainerTeam(preset.id, multiplier);
      for (const member of team.pokemons) {
        assert.equal(member.pokemon.hpMultiplier, multiplier);
        assert.equal(getCurrentHp(member.pokemon), getMaxHp(member.pokemon));
        assert.deepEqual(member.statuses, []);
        assert.deepEqual(member.statusTurns, {});
        assert.deepEqual(
          Object.values(member.pokemon.battleStages!),
          [0, 0, 0, 0, 0, 0, 0],
        );
      }
    }
  }
  const damaged = buildNpcTrainerTeam("kanto-brock");
  damaged.pokemons[0].pokemon.stats[0].value = 0;
  damaged.pokemons[0].statuses = ["burned"];
  damaged.pokemons[0].moves![0].pp = 0;
  const fresh = buildNpcTrainerTeam("kanto-brock");
  assert.ok(getCurrentHp(fresh.pokemons[0].pokemon) > 0);
  assert.deepEqual(fresh.pokemons[0].statuses, []);
  assert.ok(fresh.pokemons[0].moves![0].pp! > 0);
  assert.throws(() => buildNpcTrainerTeam("unknown"));
  assert.throws(() => buildNpcTrainerTeam("kanto-brock", NaN));
  assert.throws(() => buildNpcTrainerTeam("kanto-brock", 3));
});

test("every preset can start in the native Gen III engine without a network request", () => {
  for (const preset of trainerPresets) {
    const session = createTrainerBattleSession();
    session.teams.a = buildNpcTrainerTeam("kanto-brock");
    session.teams.a.pokemons.forEach((member) => {
      member.captureId = `player:${member.captureId}`;
    });
    session.teams.a.activeCaptureId = session.teams.a.pokemons[0].captureId;
    session.teams.b = buildNpcTrainerTeam(preset.id);
    assert.deepEqual(trainerSetupErrors(session), [], preset.id);
    assert.ok(validTrainerBattleSession(session), preset.id);
    const started = startTrainerBattle(session, [1, 2, 3, 4]);
    assert.equal(started.phase, "battle", preset.id);
    assert.ok(validTrainerBattleSession(started), preset.id);
    assert.ok(started.runtime!.requests.b.moves.length > 0, preset.id);
  }
});

test("Nest and React ship byte-identical preset data", () => {
  assert.equal(
    readFileSync(
      new URL("../src/lib/trainerBattle/kantoPresets.json", import.meta.url),
      "utf8",
    ),
    readFileSync(
      new URL(
        "../../nest-mongo-pokedex/src/pvp/kantoPresets.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
