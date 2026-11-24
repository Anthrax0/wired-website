-- Preserve item IDs and SKUs for existing purchases and equipped scenes.
update public.global_store_items
set name = case sku
  when 'yokai-bg-yetis-whiteout' then 'Whiteout Ravine'
  when 'yokai-bg-sasquatchs-blackwood' then 'Blackwood Thicket'
end
where sku in ('yokai-bg-yetis-whiteout','yokai-bg-sasquatchs-blackwood');

insert into public.global_store_items
  (sku,name,description,category,image_url,price_points,active,sort_order)
values
  ('yokai-bg-black-tide-oracle','Black Tide Oracle','Beneath an ominous moon, teal tide pools ripple with visions of disasters yet to come. Designed for Amabie.','Yokai Backgrounds','assets/yokai-backgrounds/black-tide-oracle.webp',750,true,220),
  ('yokai-bg-borrowed-voices','Borrowed Voices','Familiar voices drift from shuttered doors in an indigo-lit alley. Designed for Bakeneko.','Yokai Backgrounds','assets/yokai-backgrounds/borrowed-voices.webp',750,true,221),
  ('yokai-bg-the-long-way-home','The Long Way Home','On a deserted road, fresh footprints appear just behind yours. Designed for Betobeto-san.','Yokai Backgrounds','assets/yokai-backgrounds/the-long-way-home.webp',400,true,222),
  ('yokai-bg-the-witness-gallery','The Witness Gallery','Every mirror in the dark gallery seems to look back. Designed for Dodomeki.','Yokai Backgrounds','assets/yokai-backgrounds/the-witness-gallery.webp',550,true,223),
  ('yokai-bg-the-unserved-feast','The Unserved Feast','A crimson lantern still burns over a feast no one has touched. Designed for Futakuchi-onna.','Yokai Backgrounds','assets/yokai-backgrounds/the-unserved-feast.webp',1000,true,224),
  ('yokai-bg-field-of-forgotten-bones','Field of Forgotten Bones','Pale bones lie scattered among broken markers under a cold moon. Designed for Gashadokuro.','Yokai Backgrounds','assets/yokai-backgrounds/field-of-forgotten-bones.webp',1250,true,225),
  ('yokai-bg-silkbound-labyrinth','Silkbound Labyrinth','Old wooden gates disappear into a maze of nearly invisible silk. Designed for Jorogumo.','Yokai Backgrounds','assets/yokai-backgrounds/silkbound-labyrinth.webp',1250,true,226),
  ('yokai-bg-bloodwind-pass','Bloodwind Pass','Scarlet leaves whip through a narrow pass, then fall into an uneasy silence. Designed for Kamaitachi.','Yokai Backgrounds','assets/yokai-backgrounds/bloodwind-pass.webp',750,true,227),
  ('yokai-bg-the-undertow-pool','The Undertow Pool','Stepping stones lead into a jade-lit pool that pulls everything down. Designed for Kappa.','Yokai Backgrounds','assets/yokai-backgrounds/the-undertow-pool.webp',400,true,228),
  ('yokai-bg-rain-at-the-last-lantern','Rain at the Last Lantern','Rain pools below the last lantern, and laughter echoes from an empty lane. Designed for Kasa-obake.','Yokai Backgrounds','assets/yokai-backgrounds/rain-at-the-last-lantern.webp',400,true,229),
  ('yokai-bg-curtains-of-cursed-silk','Curtains of Cursed Silk','Strands of dark silk hang across an abandoned dressing room like snares. Designed for Kejōrō.','Yokai Backgrounds','assets/yokai-backgrounds/curtains-of-cursed-silk.webp',550,true,230),
  ('yokai-bg-the-stale-air-cellar','The Stale-Air Cellar','Low mist creeps out of a neglected cellar whose door has been shut for years. Designed for Keukegen.','Yokai Backgrounds','assets/yokai-backgrounds/the-stale-air-cellar.webp',400,true,231),
  ('yokai-bg-lanterns-that-lie','Lanterns That Lie','Blue wisps lead toward gates reflected in puddles where no gates stand. Designed for Kitsune.','Yokai Backgrounds','assets/yokai-backgrounds/lanterns-that-lie.webp',750,true,232),
  ('yokai-bg-the-listening-roots','The Listening Roots','Twisted cedar roots frame a clearing that seems to hold every whispered secret. Designed for Kodama.','Yokai Backgrounds','assets/yokai-backgrounds/the-listening-roots.webp',400,true,233),
  ('yokai-bg-court-of-broken-oaths','Court of Broken Oaths','A cracked courtyard and severed shrine ropes mark the site of a broken oath. Designed for Komainu.','Yokai Backgrounds','assets/yokai-backgrounds/court-of-broken-oaths.webp',750,true,234),
  ('yokai-bg-pale-gravefire','Pale Gravefire','Pale blue flames drift between winter-white graves. Designed for Nekomata.','Yokai Backgrounds','assets/yokai-backgrounds/pale-gravefire.webp',750,true,235),
  ('yokai-bg-the-breathless-vault','The Breathless Vault','Heavy mist clings to the walls of a sunken crypt and steals the warmth from the air. Designed for Nuppeppō.','Yokai Backgrounds','assets/yokai-backgrounds/the-breathless-vault.webp',550,true,236),
  ('yokai-bg-the-uninvited-throne','The Uninvited Throne','A single gold cushion waits in an empty reception hall that feels occupied. Designed for Nurarihyon.','Yokai Backgrounds','assets/yokai-backgrounds/the-uninvited-throne.webp',1250,true,237),
  ('yokai-bg-the-river-that-calls','The River That Calls','Willows lean over a half-drowned path, where a voice calls from beyond the bend. Designed for Nure-onna.','Yokai Backgrounds','assets/yokai-backgrounds/the-river-that-calls.webp',550,true,238),
  ('yokai-bg-the-wall-at-every-turn','The Wall at Every Turn','Black walls fold into one another until every path leads back to the same place. Designed for Nurikabe.','Yokai Backgrounds','assets/yokai-backgrounds/the-wall-at-every-turn.webp',400,true,239),
  ('yokai-bg-the-roaring-caldera','The Roaring Caldera','Molten cracks glow below a volcanic amphitheater that trembles in the dark. Designed for Oni.','Yokai Backgrounds','assets/yokai-backgrounds/the-roaring-caldera.webp',1000,true,240),
  ('yokai-bg-the-door-that-follows','The Door That Follows','Every locked door opens onto the same corridor with the same thin line of scarlet light. Designed for Onryō.','Yokai Backgrounds','assets/yokai-backgrounds/the-door-that-follows.webp',1250,true,241),
  ('yokai-bg-a-vigil-above-the-eaves','A Vigil Above the Eaves','Tall shadows stretch over old rooftops and into the windows below. Designed for Rokurokubi.','Yokai Backgrounds','assets/yokai-backgrounds/a-vigil-above-the-eaves.webp',1000,true,242),
  ('yokai-bg-the-last-crossing','The Last Crossing','A stone causeway leads into gray fog beneath the last white lanterns. Designed for Shinigami.','Yokai Backgrounds','assets/yokai-backgrounds/the-last-crossing.webp',1250,true,243),
  ('yokai-bg-the-forbidden-summit','The Forbidden Summit','A mountain gate stands above a sheer drop in the path of cutting winds. Designed for Tengu.','Yokai Backgrounds','assets/yokai-backgrounds/the-forbidden-summit.webp',750,true,244),
  ('yokai-bg-the-poisoned-breakwater','The Poisoned Breakwater','Green spray rises as black waves hammer a jagged shore. Designed for Ushi-oni.','Yokai Backgrounds','assets/yokai-backgrounds/the-poisoned-breakwater.webp',1000,true,245),
  ('yokai-bg-the-house-that-shivers','The House That Shivers','Amber light leaks through split beams as the paper screens begin to rattle. Designed for Yanari.','Yokai Backgrounds','assets/yokai-backgrounds/the-house-that-shivers.webp',400,true,246),
  ('yokai-bg-three-roads-to-ruin','Three Roads to Ruin','Three roads diverge beneath a black eclipse, each leading toward a different omen. Designed for Yatagarasu.','Yokai Backgrounds','assets/yokai-backgrounds/three-roads-to-ruin.webp',1250,true,247),
  ('yokai-bg-winters-last-breath','Winter’s Last Breath','Still snow covers a bamboo garden and the blue ice of an abandoned pond. Designed for Yuki-onna.','Yokai Backgrounds','assets/yokai-backgrounds/winters-last-breath.webp',1000,true,248),
  ('yokai-bg-the-house-of-borrowed-luck','The House of Borrowed Luck','Old coins and an overturned fortune lie in a room lit by a single lantern. Designed for Zashiki-warashi.','Yokai Backgrounds','assets/yokai-backgrounds/the-house-of-borrowed-luck.webp',400,true,249)
on conflict (sku) do update
  set name=excluded.name, description=excluded.description, category=excluded.category,
      image_url=excluded.image_url, price_points=excluded.price_points,
      active=excluded.active, sort_order=excluded.sort_order;
