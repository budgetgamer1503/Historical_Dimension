import { world, system, ItemStack, GameMode, } from "@minecraft/server";
import { ActionFormData, MessageFormData, } from "@minecraft/server-ui";
import { repairPalaceTrapdoorsAfterWave3 } from "../environment/kingdomEnvironment.js";
import { applyStageCheckpoint, restoreStageCheckpoint } from "./checkpointManager.js";
import { playBossIntroCutscene, playEndingCutscene, playIntroCutscene, playMosqueVictoryCutscene, playPalaceOpeningCutscene, restorePlayerControl, } from "./cutsceneManager.js";
export const DIMENSION_ID = "eoh:delhi_sultanate";
const STAGE_PREFIX = "eoh_delhi_stage_";
const INIT_TAG = "eoh_delhi_v30_initialized";
const STORY_COMPLETE_TAG = "eoh_delhi_story_complete";
const LEGACY_INIT_TAGS = ["maurya_v14_initialized", "maurya_v2_initialized", "maurya_initialized", "eoh_delhi_v14_initialized"];
const STORY_TITLE = "Delhi Sultanate: The Stolen Royal Seal";
const SPAWN_CLEANUP_PROPERTY = "eoh:spawn_cleanup_v31_exported_gravel_only";
const LEGACY_ENTITY_MIGRATION_PROPERTY = "eoh:legacy_entity_migration_v30";
const SPAWN_CLEANUP_RADIUS = 50;
const SPAWN_CLEANUP_MIN_Y = -64;
const SPAWN_CLEANUP_MAX_Y = -20;
const SPAWN_POS = { x: 160.5, y: -59, z: 527.5 };
const START_GATE = {
    min: { x: 157, y: -59, z: 523 },
    max: { x: 162, y: -54, z: 523 },
};
const PALACE_WAVE3_OPENING = {
    min: { x: 157, y: -59, z: 212 },
    max: { x: 162, y: -55, z: 212 },
};
const PALACE_WAVE3_OPEN_PROPERTY = "eoh:palace_wave3_open_v34";
const AMBIENT_CIVILIAN_VERSION = "3.6.0";
const AMBIENT_CIVILIAN_TARGET = 200;
const AMBIENT_CIVILIAN_PROGRESS_PROPERTY = "eoh:ambient_civilian_progress_v36";
const AMBIENT_CIVILIAN_COMPLETE_PROPERTY = "eoh:ambient_civilians_v36";
const AMBIENT_CIVILIAN_TAG = "eoh_delhi_ambient_civilian";
const POS = {
    captainGate: { x: 154.5, y: -59, z: 527.5 },
    baker: { x: 160.5, y: -59, z: 503.5 },
    farmer: { x: 224.5, y: -59, z: 465.5 },
    merchant: { x: 48.5, y: -59, z: 101.5 },
    blacksmith: { x: 80.5, y: -59, z: 48.5 },
    mosque: { x: 120.5, y: -59, z: 360.5 },
    scholar: { x: 132.5, y: -59, z: 360.5 },
    palaceGate: { x: 152.5, y: -59, z: 227.5 },
    throne: { x: 159.5, y: -57, z: 154.5 },
    sultan: { x: 159.5, y: -57, z: 144.5 },
};
const RANDOM_AUTHORS = [
    "Ibn Khalid",
    "A. Rahman",
    "S. Kareem",
    "N. Farooq",
    "M. Yusuf",
    "F. Hamid",
    "Z. Ahmed",
    "H. Qasim",
    "R. Salman",
    "L. Amina",
];
const EVIDENCE_TAGS = [
    "eoh_delhi_evidence_baker",
    "eoh_delhi_evidence_farmer",
    "eoh_delhi_evidence_merchant",
    "eoh_delhi_evidence_blacksmith",
];
const QUESTS = {
    0: {
        name: "The Sealed Southern Gate",
        objective: "Speak with Captain Zayd outside the southern gate.",
        target: POS.captainGate,
    },
    1: {
        name: "A Witness Near the Gate",
        objective: "Speak with Baker Zainab inside the southern district.",
        target: POS.baker,
    },
    2: {
        name: "Tracks Through the Farms",
        objective: "Speak with Farmer Yusuf in the eastern farm district.",
        target: POS.farmer,
    },
    3: {
        name: "Whispers in the Market",
        objective: "Question Merchant Amina in the northern market.",
        target: POS.merchant,
    },
    4: {
        name: "The Weapon Order",
        objective: "Speak with Blacksmith Hamza in the northern district.",
        target: POS.blacksmith,
    },
    5: {
        name: "Testimony at the Mosque",
        objective: "Take all four testimonies to Court Scholar Safiya near the mosque.",
        target: POS.scholar,
    },
    6: {
        name: "Attack on the Mosque Square",
        objective: "Defeat Commander Qadir's red soldiers in the square.",
        target: POS.mosque,
    },
    7: {
        name: "The Palace Defence",
        objective: "Meet Captain Zayd at the southern palace gate.",
        target: POS.palaceGate,
    },
    8: {
        name: "Hold the Palace Road",
        objective: "Defeat three fixed waves of red soldiers.",
        target: POS.palaceGate,
    },
    9: {
        name: "The Stolen Royal Seal",
        objective: "Enter the throne hall and defeat Commander Qadir.",
        target: POS.throne,
    },
    10: {
        name: "The Sultan's Oath",
        objective: "Return the Royal Seal to Sultan Alauddin Khalji.",
        target: POS.sultan,
    },
    11: {
        name: "Defender of Delhi",
        objective: "The conspiracy is defeated. Explore freely; every kingdom chest is now unlocked.",
        target: undefined,
    },
};
const NPCS = [
    {
        "id": "captain_gate",
        "name": "§r§9Captain Zayd",
        "role": "Commander of the Sultanate Guard",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 154.5,
            "y": -59,
            "z": 527.5
        },
        "professionEvent": "minecraft:become_weaponsmith"
    },
    {
        "id": "baker_zainab",
        "name": "§r§eBaker Zainab",
        "role": "Baker",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 160.5,
            "y": -59,
            "z": 503.5
        },
        "professionEvent": "minecraft:become_farmer",
        "gift": [
            {
                "typeId": "minecraft:bread",
                "amount": 8,
                "name": "§r§eZainab's Fresh Bread"
            }
        ]
    },
    {
        "id": "healer_maryam",
        "name": "§r§dHealer Maryam",
        "role": "Healer",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 152.5,
            "y": -59,
            "z": 465.5
        },
        "professionEvent": "minecraft:become_cleric",
        "gift": [
            {
                "typeId": "minecraft:golden_apple",
                "amount": 1,
                "name": "§r§dMaryam's Medicine"
            }
        ]
    },
    {
        "id": "farmer_yusuf",
        "name": "§r§aFarmer Yusuf",
        "role": "Crop Farmer",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 224.5,
            "y": -59,
            "z": 465.5
        },
        "professionEvent": "minecraft:become_farmer",
        "gift": [
            {
                "typeId": "minecraft:carrot",
                "amount": 12,
                "name": "§r§aFarm Carrots"
            }
        ]
    },
    {
        "id": "water_carrier_ibrahim",
        "name": "§r§bWater Carrier Ibrahim",
        "role": "Water Carrier",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 170.5,
            "y": -59,
            "z": 502.5
        },
        "professionEvent": "minecraft:become_fisherman",
        "gift": [
            {
                "typeId": "minecraft:water_bucket",
                "amount": 1,
                "name": "§r§bIbrahim's Water Bucket"
            }
        ]
    },
    {
        "id": "porter_rashid",
        "name": "§r§6Porter Rashid",
        "role": "Gate Porter",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 148.5,
            "y": -59,
            "z": 501.5
        },
        "professionEvent": "minecraft:become_leatherworker",
        "gift": [
            {
                "typeId": "minecraft:bread",
                "amount": 3,
                "name": "§r§ePorter's Travel Bread"
            }
        ]
    },
    {
        "id": "gardener_hassan",
        "name": "§r§aGardener Hassan",
        "role": "Royal Gardener",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 143.5,
            "y": -59,
            "z": 466.5
        },
        "professionEvent": "minecraft:become_farmer",
        "gift": [
            {
                "typeId": "minecraft:bone_meal",
                "amount": 8,
                "name": "§r§fGarden Fertiliser"
            }
        ]
    },
    {
        "id": "florist_noor",
        "name": "§r§dFlorist Noor",
        "role": "Florist",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 169.5,
            "y": -59,
            "z": 461.5
        },
        "professionEvent": "minecraft:become_farmer",
        "gift": [
            {
                "typeId": "minecraft:poppy",
                "amount": 4,
                "name": "§r§cRoyal Garden Flowers"
            }
        ]
    },
    {
        "id": "shepherd_qasim",
        "name": "§r§fShepherd Qasim",
        "role": "Shepherd",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 220.5,
            "y": -59,
            "z": 442.5
        },
        "professionEvent": "minecraft:become_shepherd",
        "gift": [
            {
                "typeId": "minecraft:white_wool",
                "amount": 6,
                "name": "§r§fFarm Wool"
            }
        ]
    },
    {
        "id": "miller_uthman",
        "name": "§r§eMiller Uthman",
        "role": "Grain Miller",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 201.5,
            "y": -59,
            "z": 421.5
        },
        "professionEvent": "minecraft:become_farmer",
        "gift": [
            {
                "typeId": "minecraft:bread",
                "amount": 5,
                "name": "§r§eMill Bread"
            }
        ]
    },
    {
        "id": "beekeeper_zahra",
        "name": "§r§6Beekeeper Zahra",
        "role": "Beekeeper",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 247.5,
            "y": -59,
            "z": 431.5
        },
        "professionEvent": "minecraft:become_farmer",
        "gift": [
            {
                "typeId": "minecraft:honeycomb",
                "amount": 6,
                "name": "§r§6Farm Honeycomb"
            }
        ]
    },
    {
        "id": "fisher_bilal",
        "name": "§r§bFisherman Bilal",
        "role": "Reservoir Fisherman",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 55.5,
            "y": -59,
            "z": 425.5
        },
        "professionEvent": "minecraft:become_fisherman",
        "gift": [
            {
                "typeId": "minecraft:cooked_cod",
                "amount": 6,
                "name": "§r§bBilal's Cooked Fish"
            }
        ]
    },
    {
        "id": "stable_farid",
        "name": "§r§6Stablemaster Farid",
        "role": "Stablemaster",
        "district": "Part I - Southern Gate and Farms",
        "pos": {
            "x": 32.5,
            "y": -59,
            "z": 480.5
        },
        "professionEvent": "minecraft:become_leatherworker",
        "gift": [
            {
                "typeId": "minecraft:saddle",
                "amount": 1,
                "name": "§r§6Stable Saddle"
            }
        ]
    },
    {
        "id": "imam_hamid",
        "name": "§r§aImam Hamid",
        "role": "Imam of the Great Mosque",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 120.5,
            "y": -59,
            "z": 360.5
        },
        "professionEvent": "minecraft:become_cleric",
        "specialGift": "quran"
    },
    {
        "id": "scholar_safiya",
        "name": "§r§bCourt Scholar Safiya",
        "role": "Court Scholar",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 132.5,
            "y": -59,
            "z": 360.5
        },
        "professionEvent": "minecraft:become_librarian",
        "specialGift": "city_guide"
    },
    {
        "id": "potter_idris",
        "name": "§r§6Potter Idris",
        "role": "Potter",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 51.5,
            "y": -59,
            "z": 331.5
        },
        "professionEvent": "minecraft:become_mason",
        "gift": [
            {
                "typeId": "minecraft:flower_pot",
                "amount": 2,
                "name": "§r§6Handmade Clay Pots"
            }
        ]
    },
    {
        "id": "mason_bilqis",
        "name": "§r§7Mason Bilqis",
        "role": "Stone Mason",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 81.5,
            "y": -59,
            "z": 320.5
        },
        "professionEvent": "minecraft:become_mason",
        "gift": [
            {
                "typeId": "minecraft:stone_bricks",
                "amount": 8,
                "name": "§r§7Cut Stone Bricks"
            }
        ]
    },
    {
        "id": "cobbler_faisal",
        "name": "§r§6Cobbler Faisal",
        "role": "Cobbler",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 109.5,
            "y": -59,
            "z": 302.5
        },
        "professionEvent": "minecraft:become_leatherworker",
        "gift": [
            {
                "typeId": "minecraft:leather",
                "amount": 4,
                "name": "§r§6Shoe Leather"
            }
        ]
    },
    {
        "id": "lamp_lighter_latifa",
        "name": "§r§eLamp Lighter Latifa",
        "role": "Lamp Lighter",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 66.5,
            "y": -59,
            "z": 361.5
        },
        "professionEvent": "minecraft:become_toolsmith",
        "gift": [
            {
                "typeId": "minecraft:lantern",
                "amount": 2,
                "name": "§r§eStreet Lanterns"
            }
        ]
    },
    {
        "id": "cloth_dyer_yasmin",
        "name": "§r§9Cloth Dyer Yasmin",
        "role": "Cloth Dyer",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 184.5,
            "y": -59,
            "z": 391.5
        },
        "professionEvent": "minecraft:become_shepherd",
        "gift": [
            {
                "typeId": "minecraft:blue_dye",
                "amount": 4,
                "name": "§r§9Blue Cloth Dye"
            }
        ]
    },
    {
        "id": "cook_farah",
        "name": "§r§cCook Farah",
        "role": "Neighbourhood Cook",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 211.5,
            "y": -59,
            "z": 351.5
        },
        "professionEvent": "minecraft:become_butcher",
        "gift": [
            {
                "typeId": "minecraft:cooked_chicken",
                "amount": 4,
                "name": "§r§cHot Street Meal"
            }
        ]
    },
    {
        "id": "elder_abdul",
        "name": "§r§fElder Abdul",
        "role": "Community Elder",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 270.5,
            "y": -59,
            "z": 371.5
        },
        "professionEvent": "minecraft:become_librarian",
        "gift": [
            {
                "typeId": "minecraft:compass",
                "amount": 1,
                "name": "§r§fAbdul's Old Compass"
            }
        ]
    },
    {
        "id": "carpenter_omar",
        "name": "§r§6Carpenter Omar",
        "role": "Carpenter",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 137.5,
            "y": -59,
            "z": 408.5
        },
        "professionEvent": "minecraft:become_toolsmith",
        "gift": [
            {
                "typeId": "minecraft:stick",
                "amount": 12,
                "name": "§r§6Carved Wooden Rods"
            }
        ]
    },
    {
        "id": "muezzin_rahman",
        "name": "§r§aMuezzin Abdul Rahman",
        "role": "Muezzin",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 114.5,
            "y": -59,
            "z": 348.5
        },
        "professionEvent": "minecraft:become_cleric",
        "gift": [
            {
                "typeId": "minecraft:bread",
                "amount": 2,
                "name": "§r§eMosque Guest Bread"
            }
        ]
    },
    {
        "id": "calligrapher_mariam",
        "name": "§r§bCalligrapher Mariam",
        "role": "Calligrapher",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 141.5,
            "y": -59,
            "z": 371.5
        },
        "professionEvent": "minecraft:become_librarian",
        "gift": [
            {
                "typeId": "minecraft:paper",
                "amount": 6,
                "name": "§r§fCalligraphy Paper"
            },
            {
                "typeId": "minecraft:ink_sac",
                "amount": 2,
                "name": "§r§8Calligraphy Ink"
            }
        ]
    },
    {
        "id": "bookbinder_ismail",
        "name": "§r§bBookbinder Ismail",
        "role": "Bookbinder",
        "district": "Part II - Central Homes and Great Mosque",
        "pos": {
            "x": 151.5,
            "y": -59,
            "z": 360.5
        },
        "professionEvent": "minecraft:become_librarian",
        "gift": [
            {
                "typeId": "minecraft:book",
                "amount": 2,
                "name": "§r§bHand-Bound Books"
            }
        ]
    },
    {
        "id": "captain_palace",
        "name": "§r§9Captain Zayd - Palace Command",
        "role": "Commander of the Sultanate Guard",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 152.5,
            "y": -59,
            "z": 227.5
        },
        "professionEvent": "minecraft:become_weaponsmith"
    },
    {
        "id": "sultan_alauddin",
        "name": "§r§6Sultan Alauddin Khalji",
        "role": "Sultan of Delhi (r. 1296–1316)",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 159.5,
            "y": -57,
            "z": 144.5
        },
        "professionEvent": "minecraft:become_librarian"
    },
    {
        "id": "palace_cook_hafsa",
        "name": "§r§cPalace Cook Hafsa",
        "role": "Palace Cook",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 136.5,
            "y": -59,
            "z": 206.5
        },
        "professionEvent": "minecraft:become_butcher",
        "gift": [
            {
                "typeId": "minecraft:cooked_chicken",
                "amount": 4,
                "name": "§r§cPalace Meal"
            }
        ]
    },
    {
        "id": "steward_mansur",
        "name": "§r§fSteward Mansur",
        "role": "Palace Steward",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 184.5,
            "y": -59,
            "z": 206.5
        },
        "professionEvent": "minecraft:become_cartographer",
        "gift": [
            {
                "typeId": "minecraft:paper",
                "amount": 4,
                "name": "§r§fPalace Entry Notes"
            }
        ]
    },
    {
        "id": "royal_physician_saba",
        "name": "§r§dRoyal Physician Saba",
        "role": "Royal Physician",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 132.5,
            "y": -59,
            "z": 181.5
        },
        "professionEvent": "minecraft:become_cleric",
        "gift": [
            {
                "typeId": "minecraft:golden_apple",
                "amount": 1,
                "name": "§r§dRoyal Medicine"
            }
        ]
    },
    {
        "id": "palace_gardener_saad",
        "name": "§r§aPalace Gardener Saad",
        "role": "Palace Gardener",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 189.5,
            "y": -59,
            "z": 181.5
        },
        "professionEvent": "minecraft:become_farmer",
        "gift": [
            {
                "typeId": "minecraft:bone_meal",
                "amount": 6,
                "name": "§r§fPalace Garden Fertiliser"
            }
        ]
    },
    {
        "id": "stable_groom_haris",
        "name": "§r§6Stable Groom Haris",
        "role": "Stable Groom",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 121.5,
            "y": -59,
            "z": 224.5
        },
        "professionEvent": "minecraft:become_leatherworker",
        "gift": [
            {
                "typeId": "minecraft:hay_block",
                "amount": 2,
                "name": "§r§eStable Hay"
            }
        ]
    },
    {
        "id": "palace_servant_amal",
        "name": "§r§ePalace Servant Amal",
        "role": "Palace Servant",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 199.5,
            "y": -59,
            "z": 224.5
        },
        "professionEvent": "minecraft:become_farmer",
        "gift": [
            {
                "typeId": "minecraft:bread",
                "amount": 3,
                "name": "§r§ePalace Bread"
            }
        ]
    },
    {
        "id": "court_scribe_zoya",
        "name": "§r§bCourt Scribe Zoya",
        "role": "Court Scribe",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 151.5,
            "y": -59,
            "z": 171.5
        },
        "professionEvent": "minecraft:become_librarian",
        "gift": [
            {
                "typeId": "minecraft:book",
                "amount": 1,
                "name": "§r§bCourt Record Book"
            }
        ]
    },
    {
        "id": "royal_armorer_khalil",
        "name": "§r§7Royal Armorer Khalil",
        "role": "Royal Armorer",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 169.5,
            "y": -59,
            "z": 171.5
        },
        "professionEvent": "minecraft:become_armorer",
        "gift": [
            {
                "typeId": "minecraft:iron_nugget",
                "amount": 8,
                "name": "§r§7Armor Rivets"
            }
        ]
    },
    {
        "id": "royal_tailor_sana",
        "name": "§r§dRoyal Tailor Sana",
        "role": "Royal Tailor",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 141.5,
            "y": -59,
            "z": 154.5
        },
        "professionEvent": "minecraft:become_leatherworker",
        "gift": [
            {
                "typeId": "minecraft:leather_chestplate",
                "amount": 1,
                "name": "§r§dSana's Court Coat"
            }
        ]
    },
    {
        "id": "palace_butler_jamal",
        "name": "§r§fPalace Butler Jamal",
        "role": "Palace Butler",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 178.5,
            "y": -59,
            "z": 154.5
        },
        "professionEvent": "minecraft:become_cartographer",
        "gift": [
            {
                "typeId": "minecraft:bread",
                "amount": 3,
                "name": "§r§eCourt Refreshments"
            }
        ]
    },
    {
        "id": "merchant_amina",
        "name": "§r§eMerchant Amina",
        "role": "Market Merchant",
        "district": "Part IV - Northern Market and Workshops",
        "pos": {
            "x": 48.5,
            "y": -59,
            "z": 101.5
        },
        "professionEvent": "minecraft:become_cartographer",
        "gift": [
            {
                "typeId": "minecraft:emerald",
                "amount": 3,
                "name": "§r§aMarket Tokens"
            }
        ]
    },
    {
        "id": "blacksmith_hamza",
        "name": "§r§6Blacksmith Hamza",
        "role": "Blacksmith",
        "district": "Part IV - Northern Market and Workshops",
        "pos": {
            "x": 80.5,
            "y": -59,
            "z": 48.5
        },
        "professionEvent": "minecraft:become_weaponsmith",
        "gift": [
            {
                "typeId": "minecraft:shield",
                "amount": 1,
                "name": "§r§9Sultanate Guard Shield"
            }
        ]
    },
    {
        "id": "butcher_karim",
        "name": "§r§cButcher Karim",
        "role": "Butcher",
        "district": "Part IV - Northern Market and Workshops",
        "pos": {
            "x": 65.5,
            "y": -59,
            "z": 85.5
        },
        "professionEvent": "minecraft:become_butcher",
        "gift": [
            {
                "typeId": "minecraft:cooked_beef",
                "amount": 6,
                "name": "§r§cKarim's Provisions"
            }
        ]
    },
    {
        "id": "librarian_fatima",
        "name": "§r§bLibrarian Fatima",
        "role": "Librarian",
        "district": "Part IV - Northern Market and Workshops",
        "pos": {
            "x": 112.5,
            "y": -59,
            "z": 100.5
        },
        "professionEvent": "minecraft:become_librarian",
        "specialGift": "history_book"
    },
    {
        "id": "spice_seller_rehana",
        "name": "§r§6Spice Seller Rehana",
        "role": "Spice Seller",
        "district": "Part IV - Northern Market and Workshops",
        "pos": {
            "x": 39.5,
            "y": -59,
            "z": 69.5
        },
        "professionEvent": "minecraft:become_farmer",
        "gift": [
            {
                "typeId": "minecraft:sugar",
                "amount": 4,
                "name": "§r§fMarket Sugar"
            }
        ]
    },
    {
        "id": "jeweller_reem",
        "name": "§r§eJeweller Reem",
        "role": "Jeweller",
        "district": "Part IV - Northern Market and Workshops",
        "pos": {
            "x": 61.5,
            "y": -59,
            "z": 60.5
        },
        "professionEvent": "minecraft:become_armorer",
        "gift": [
            {
                "typeId": "minecraft:gold_nugget",
                "amount": 4,
                "name": "§r§eJeweller's Gold Pieces"
            }
        ]
    },
    {
        "id": "cloth_merchant_lina",
        "name": "§r§dCloth Merchant Lina",
        "role": "Cloth Merchant",
        "district": "Part IV - Northern Market and Workshops",
        "pos": {
            "x": 91.5,
            "y": -59,
            "z": 70.5
        },
        "professionEvent": "minecraft:become_shepherd",
        "gift": [
            {
                "typeId": "minecraft:cyan_wool",
                "amount": 4,
                "name": "§r§bFine Market Cloth"
            }
        ]
    },
    {
        "id": "tea_seller_hakim",
        "name": "§r§6Tea Seller Hakim",
        "role": "Tea Seller",
        "district": "Part IV - Northern Market and Workshops",
        "pos": {
            "x": 121.5,
            "y": -59,
            "z": 70.5
        },
        "professionEvent": "minecraft:become_farmer",
        "gift": [
            {
                "typeId": "minecraft:honey_bottle",
                "amount": 1,
                "name": "§r§6Sweet Market Drink"
            }
        ]
    },
    {
        "id": "grain_merchant_nadia",
        "name": "§r§eGrain Merchant Nadia",
        "role": "Grain Merchant",
        "district": "Part IV - Northern Market and Workshops",
        "pos": {
            "x": 151.5,
            "y": -59,
            "z": 81.5
        },
        "professionEvent": "minecraft:become_farmer",
        "gift": [
            {
                "typeId": "minecraft:wheat",
                "amount": 8,
                "name": "§r§eMarket Grain"
            }
        ]
    },
    {
        "id": "fishmonger_adnan",
        "name": "§r§bFishmonger Adnan",
        "role": "Fishmonger",
        "district": "Part IV - Northern Market and Workshops",
        "pos": {
            "x": 181.5,
            "y": -59,
            "z": 70.5
        },
        "professionEvent": "minecraft:become_fisherman",
        "gift": [
            {
                "typeId": "minecraft:cooked_cod",
                "amount": 4,
                "name": "§r§bMarket Fish"
            }
        ]
    },
    {
        "id": "potter_salma",
        "name": "§r§6Market Potter Salma",
        "role": "Market Potter",
        "district": "Part IV - Northern Market and Workshops",
        "pos": {
            "x": 240.5,
            "y": -59,
            "z": 71.5
        },
        "professionEvent": "minecraft:become_mason",
        "gift": [
            {
                "typeId": "minecraft:brick",
                "amount": 8,
                "name": "§r§6Kiln-Fired Bricks"
            }
        ]
    },
    {
        "id": "scribe_rania",
        "name": "§r§bMarket Scribe Rania",
        "role": "Public Scribe",
        "district": "Part IV - Northern Market and Workshops",
        "pos": {
            "x": 270.5,
            "y": -59,
            "z": 91.5
        },
        "professionEvent": "minecraft:become_librarian",
        "gift": [
            {
                "typeId": "minecraft:paper",
                "amount": 8,
                "name": "§r§fScribe's Paper"
            }
        ]
    },
    {
        "id": "royal_messenger_umar",
        "name": "§r§eRoyal Messenger Umar",
        "role": "Royal Messenger",
        "district": "Part III - Royal Palace and Citadel",
        "pos": {
            "x": 188.5,
            "y": -59,
            "z": 194.5
        },
        "professionEvent": "minecraft:become_cartographer",
        "gift": [
            {
                "typeId": "minecraft:paper",
                "amount": 4,
                "name": "§r§eRoyal Message Papers"
            }
        ]
    }
];
const AMBIENT_CIVILIAN_OFFSETS = [
    { x: 6, z: 6 },
    { x: -6, z: 6 },
    { x: 6, z: -6 },
    { x: -6, z: -6 },
];
const AMBIENT_CIVILIAN_PROFESSIONS = [
    "minecraft:become_farmer",
    "minecraft:become_fisherman",
    "minecraft:become_shepherd",
    "minecraft:become_mason",
    "minecraft:become_leatherworker",
    "minecraft:become_librarian",
    "minecraft:become_cartographer",
    "minecraft:become_butcher",
    "minecraft:become_toolsmith",
    "minecraft:become_weaponsmith",
    "minecraft:become_armorer",
    "minecraft:become_cleric",
];
// Four ordinary residents are assigned around each of the first fifty authored
// citizen anchors, giving an exact population increase of 200 villagers.
const AMBIENT_CIVILIANS = NPCS.slice(0, 50)
    .flatMap((anchor, anchorIndex) => AMBIENT_CIVILIAN_OFFSETS.map((offset, offsetIndex) => {
    const index = anchorIndex * AMBIENT_CIVILIAN_OFFSETS.length + offsetIndex;
    return {
        id: `resident_${String(index + 1).padStart(3, "0")}`,
        pos: {
            x: anchor.pos.x + offset.x,
            y: anchor.pos.y,
            z: anchor.pos.z + offset.z,
        },
        professionEvent: AMBIENT_CIVILIAN_PROFESSIONS[index % AMBIENT_CIVILIAN_PROFESSIONS.length],
    };
}))
    .slice(0, AMBIENT_CIVILIAN_TARGET);
const BLUE_GUARDS = [
    { id: "gate_1", name: "§r§9Sultanate Guard Harun", pos: { x: 149.5, y: -59, z: 527.5 } },
    { id: "gate_2", name: "§r§9Sultanate Guard Tariq", pos: { x: 166.5, y: -59, z: 527.5 } },
    { id: "gate_3", name: "§r§9Sultanate Guard Imran", pos: { x: 154.5, y: -59, z: 519.5 } },
    { id: "gate_4", name: "§r§9Sultanate Guard Nadeem", pos: { x: 165.5, y: -59, z: 519.5 } },
    { id: "gate_5", name: "§r§9Sultanate Guard Faisal", pos: { x: 151.5, y: -59, z: 511.5 } },
    { id: "gate_6", name: "§r§9Sultanate Guard Rafi", pos: { x: 168.5, y: -59, z: 511.5 } },
    { id: "road_1", name: "§r§9Sultanate Guard Dawud", pos: { x: 145.5, y: -59, z: 444.5 } },
    { id: "road_2", name: "§r§9Sultanate Guard Musa", pos: { x: 174.5, y: -59, z: 444.5 } },
    { id: "road_3", name: "§r§9Sultanate Guard Ilyas", pos: { x: 145.5, y: -59, z: 385.5 } },
    { id: "road_4", name: "§r§9Sultanate Guard Sami", pos: { x: 174.5, y: -59, z: 385.5 } },
    { id: "mosque_1", name: "§r§9Mosque Guard Khalid", pos: { x: 109.5, y: -59, z: 351.5 } },
    { id: "mosque_2", name: "§r§9Mosque Guard Majid", pos: { x: 131.5, y: -59, z: 351.5 } },
    { id: "mosque_3", name: "§r§9Mosque Guard Nasir", pos: { x: 109.5, y: -59, z: 371.5 } },
    { id: "mosque_4", name: "§r§9Mosque Guard Adil", pos: { x: 131.5, y: -59, z: 371.5 } },
    { id: "palace_1", name: "§r§9Palace Guard Aziz", pos: { x: 140.5, y: -59, z: 231.5 } },
    { id: "palace_2", name: "§r§9Palace Guard Bashir", pos: { x: 146.5, y: -59, z: 231.5 } },
    { id: "palace_3", name: "§r§9Palace Guard Kamal", pos: { x: 158.5, y: -59, z: 231.5 } },
    { id: "palace_4", name: "§r§9Palace Guard Latif", pos: { x: 164.5, y: -59, z: 231.5 } },
    { id: "palace_5", name: "§r§9Palace Guard Munir", pos: { x: 140.5, y: -59, z: 219.5 } },
    { id: "palace_6", name: "§r§9Palace Guard Rayan", pos: { x: 146.5, y: -59, z: 219.5 } },
    { id: "palace_7", name: "§r§9Palace Guard Saif", pos: { x: 158.5, y: -59, z: 219.5 } },
    { id: "palace_8", name: "§r§9Palace Guard Waleed", pos: { x: 164.5, y: -59, z: 219.5 } },
    { id: "court_1", name: "§r§9Royal Guard Umar", pos: { x: 145.5, y: -59, z: 185.5 } },
    { id: "court_2", name: "§r§9Royal Guard Yahya", pos: { x: 174.5, y: -59, z: 185.5 } },
    { id: "court_3", name: "§r§9Royal Guard Zubair", pos: { x: 145.5, y: -59, z: 170.5 } },
    { id: "court_4", name: "§r§9Royal Guard Anas", pos: { x: 174.5, y: -59, z: 170.5 } },
];
const ACTIVE_BLUE_GUARDS = BLUE_GUARDS.filter((guard) => !guard.id.startsWith("palace_") && !guard.id.startsWith("court_"));
const PUBLIC_CHEST_ZONES = [
    { name: "southern gate supplies", minX: 142, maxX: 172, minZ: 507, maxZ: 540, minStage: 0 },
    { name: "farm storehouse", minX: 205, maxX: 245, minZ: 440, maxZ: 492, minStage: 1 },
    { name: "public market", minX: 30, maxX: 122, minZ: 28, maxZ: 116, minStage: 3 },
    { name: "mosque library", minX: 106, maxX: 166, minZ: 330, maxZ: 390, minStage: 5 },
    { name: "palace reward room", minX: 145, maxX: 176, minZ: 133, maxZ: 176, minStage: 10 },
];
const CHEST_TYPES = new Set([
    "minecraft:chest",
    "minecraft:trapped_chest",
]);
const LOOSE_BOOK_TYPES = new Set([
    "minecraft:book",
    "minecraft:writable_book",
    "minecraft:written_book",
    "minecraft:enchanted_book",
]);
const AIR_LIKE = new Set([
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air",
    "minecraft:tallgrass",
    "minecraft:short_grass",
    "minecraft:snow_layer",
]);
export function dimension() {
    return world.getDimension(DIMENSION_ID);
}
export function inKingdom(entity) {
    return safe(() => entity?.dimension?.id === DIMENSION_ID, false);
}
function safe(callback, fallback = undefined) {
    try {
        return callback();
    }
    catch (error) {
        return fallback;
    }
}
function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function hasTag(entity, tag) {
    return safe(() => entity.getTags().includes(tag), false);
}
function getStage(player) {
    const stageTag = safe(() => player.getTags().find((tag) => tag.startsWith(STAGE_PREFIX)), undefined);
    if (!stageTag)
        return 0;
    const value = Number(stageTag.slice(STAGE_PREFIX.length));
    return Number.isFinite(value) ? value : 0;
}
function setStage(player, stage) {
    const previous = getStage(player);
    for (const tag of safe(() => player.getTags(), [])) {
        if (tag.startsWith(STAGE_PREFIX))
            safe(() => player.removeTag(tag));
    }
    safe(() => player.addTag(`${STAGE_PREFIX}${stage}`));
    applyStageCheckpoint(player, stage, previous !== stage);
}
function clearTagsByPrefix(player, prefixes) {
    for (const tag of safe(() => player.getTags(), [])) {
        if (prefixes.some((prefix) => tag.startsWith(prefix))) {
            safe(() => player.removeTag(tag));
        }
    }
}
function showTitle(player, title, subtitle = "") {
    safe(() => player.onScreenDisplay.setTitle(title, {
        subtitle,
        fadeInDuration: 10,
        stayDuration: 60,
        fadeOutDuration: 20,
    }));
}
function playQuestSound(player) {
    safe(() => player.playSound("random.levelup", { volume: 0.7, pitch: 1.1 }));
}
function getInventory(player) {
    return safe(() => player.getComponent("minecraft:inventory")?.container, undefined);
}
function storeOrDropItem(player, item) {
    const container = getInventory(player);
    if (!container)
        return false;
    try {
        const remaining = container.addItem(item);
        if (!remaining)
            return true;
        const dropPos = { x: player.location.x, y: player.location.y + 0.5, z: player.location.z };
        const dropped = safe(() => dimension().spawnItem(remaining, dropPos), undefined);
        if (dropped) {
            safe(() => dropped.addTag("eoh_delhi_important_drop"));
            safe(() => player.sendMessage("§eYour inventory was full, so the item was safely dropped at your feet."));
            return true;
        }
        return false;
    }
    catch (error) {
        return false;
    }
}
function giveItem(player, typeId, amount, nameTag, lore = []) {
    try {
        const item = new ItemStack(typeId, amount);
        if (nameTag)
            item.nameTag = nameTag;
        if (lore.length > 0)
            item.setLore(lore);
        return storeOrDropItem(player, item);
    }
    catch (error) {
        return false;
    }
}
function chooseRandomAuthor() {
    return RANDOM_AUTHORS[Math.floor(Math.random() * RANDOM_AUTHORS.length)];
}
function giveSignedBook(player, title, pages, options = {}) {
    const container = getInventory(player);
    if (!container)
        return false;
    const author = options.author ?? chooseRandomAuthor();
    const displayName = options.displayName ?? `§r§e${title}`;
    try {
        const item = new ItemStack("minecraft:writable_book", 1);
        const component = item.getComponent("minecraft:book");
        if (component) {
            component.setContents(pages.map((page) => String(page).slice(0, 256)));
            component.signBook(String(title).slice(0, 16), author);
        }
        item.nameTag = displayName;
        item.setLore([`§7Author: ${author}`, ...(options.lore ?? [])]);
        return storeOrDropItem(player, item);
    }
    catch (error) {
        return giveItem(player, "minecraft:written_book", 1, displayName, [`§7Author: ${author}`, ...(options.lore ?? [])]);
    }
}
function hasItemType(player, typeId) {
    const container = getInventory(player);
    if (!container)
        return false;
    for (let index = 0; index < container.size; index += 1) {
        const item = safe(() => container.getItem(index), undefined);
        if (item?.typeId === typeId)
            return true;
    }
    return false;
}
function hasNamedItem(player, nameTag) {
    const container = getInventory(player);
    if (!container)
        return false;
    for (let index = 0; index < container.size; index += 1) {
        const item = safe(() => container.getItem(index), undefined);
        if (item?.nameTag === nameTag)
            return true;
    }
    return false;
}
function removeNamedItem(player, nameTag) {
    const container = getInventory(player);
    if (!container)
        return false;
    for (let index = 0; index < container.size; index += 1) {
        const item = safe(() => container.getItem(index), undefined);
        if (item?.nameTag === nameTag) {
            safe(() => container.setItem(index, undefined));
            return true;
        }
    }
    return false;
}
function giveStarterKit(player) {
    if (!hasNamedItem(player, "§r§9Sultanate Guard Sword")) {
        giveItem(player, "minecraft:iron_sword", 1, "§r§9Sultanate Guard Sword", ["§7Issued by Captain Zayd"]);
    }
    if (!hasNamedItem(player, "§r§eDelhi Quest Journal")) {
        giveSignedBook(player, "Quest Journal", [
            "Delhi Sultanate\nThe Stolen Royal Seal",
            "Speak with citizens, gather testimony, protect the mosque square, and defend Sultan Alauddin Khalji.",
            "Use this journal or type !quest to view the current objective.",
        ], {
            displayName: "§r§eDelhi Quest Journal",
            lore: ["§7Use to view your objective"],
        });
    }
    if (!hasTag(player, "eoh_delhi_starter_food")) {
        safe(() => player.addTag("eoh_delhi_starter_food"));
        giveItem(player, "minecraft:bread", 6, "§r§eTravel Bread", []);
    }
}
function giveImperialSignet(player) {
    if (hasNamedItem(player, "§r§6Royal Seal of Delhi"))
        return true;
    return giveItem(player, "minecraft:gold_ingot", 1, "§r§6Royal Seal of Delhi", ["§7Recovered from Commander Qadir", "§7Return it to Sultan Alauddin Khalji"]);
}
function isAirLike(typeId) {
    return AIR_LIKE.has(typeId);
}
function isSafeStandingPosition(pos) {
    const dim = dimension();
    const x = Math.floor(pos.x);
    const y = Math.floor(pos.y);
    const z = Math.floor(pos.z);
    const feet = safe(() => dim.getBlock({ x, y, z }), undefined);
    const head = safe(() => dim.getBlock({ x, y: y + 1, z }), undefined);
    const below = safe(() => dim.getBlock({ x, y: y - 1, z }), undefined);
    if (!feet || !head || !below)
        return false;
    return isAirLike(feet.typeId) && isAirLike(head.typeId) && !isAirLike(below.typeId);
}
function findSafePosition(preferred) {
    const offsets = [
        [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1],
        [2, 0], [-2, 0], [0, 2], [0, -2],
    ];
    const yOffsets = [0, 1, -1, 2, -2, 3, -3];
    for (const yOffset of yOffsets) {
        for (const [xOffset, zOffset] of offsets) {
            const candidate = {
                x: Math.floor(preferred.x + xOffset) + 0.5,
                y: Math.floor(preferred.y + yOffset),
                z: Math.floor(preferred.z + zOffset) + 0.5,
            };
            if (isSafeStandingPosition(candidate))
                return candidate;
        }
    }
    return preferred;
}
function waitStoryTicks(ticks) {
    return new Promise((resolve) => system.runTimeout(resolve, ticks));
}
function findAmbientSafePosition(preferred) {
    const yOffsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
    for (let radius = 0; radius <= 10; radius += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
            for (let dz = -radius; dz <= radius; dz += 1) {
                if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dz) !== radius)
                    continue;
                for (const yOffset of yOffsets) {
                    const candidate = {
                        x: Math.floor(preferred.x + dx) + 0.5,
                        y: Math.floor(preferred.y + yOffset),
                        z: Math.floor(preferred.z + dz) + 0.5,
                    };
                    if (isSafeStandingPosition(candidate))
                        return candidate;
                }
            }
        }
    }
    return findSafePosition(preferred);
}
async function withCivilianLoadedArea(id, anchor, callback) {
    const manager = safe(() => world.tickingAreaManager, undefined);
    const dim = dimension();
    const centreX = Math.floor(anchor.x);
    const centreZ = Math.floor(anchor.z);
    let created = false;
    if (manager?.createTickingArea) {
        safe(() => manager.removeTickingArea(id));
        try {
            await manager.createTickingArea(id, {
                dimension: dim,
                from: { x: centreX - 16, y: -64, z: centreZ - 16 },
                to: { x: centreX + 16, y: -35, z: centreZ + 16 },
            });
            created = true;
        }
        catch (error) {
            // Placement below still provides a useful retry path on builds where
            // scripted ticking areas are unavailable.
        }
    }
    try {
        await waitStoryTicks(2);
        await callback();
    }
    finally {
        if (created)
            safe(() => manager.removeTickingArea(id));
    }
}
function protectAmbientCivilian(entity) {
    safe(() => entity.addEffect("minecraft:resistance", 20000000, { amplifier: 4, showParticles: false }));
    safe(() => entity.addEffect("minecraft:regeneration", 20000000, { amplifier: 0, showParticles: false }));
}
let ambientCivilianPromise;
async function buildAmbientCivilianPopulation(player) {
    if (safe(() => world.getDynamicProperty(AMBIENT_CIVILIAN_COMPLETE_PROPERTY), "") === AMBIENT_CIVILIAN_VERSION)
        return;
    const rawProgress = Number(safe(() => world.getDynamicProperty(AMBIENT_CIVILIAN_PROGRESS_PROPERTY), 0));
    const start = Number.isInteger(rawProgress) && rawProgress >= 0 && rawProgress <= AMBIENT_CIVILIANS.length
        ? rawProgress
        : 0;
    if (start === 0) {
    }
    const residentsPerAnchor = AMBIENT_CIVILIAN_OFFSETS.length;
    const firstAnchor = Math.floor(start / residentsPerAnchor);
    for (let anchorIndex = firstAnchor; anchorIndex < 50; anchorIndex += 1) {
        const anchor = NPCS[anchorIndex];
        const groupStart = Math.max(start, anchorIndex * residentsPerAnchor);
        const groupEnd = Math.min(groupStart + residentsPerAnchor, (anchorIndex + 1) * residentsPerAnchor);
        await withCivilianLoadedArea(`eoh_residents_${anchorIndex}`, anchor.pos, async () => {
            for (let index = groupStart; index < groupEnd; index += 1) {
                const resident = AMBIENT_CIVILIANS[index];
                const uniqueTag = `eoh_delhi_civilian_${resident.id}`;
                const existing = safe(() => [...dimension().getEntities({ tags: [uniqueTag] })], []);
                if (existing.length === 0) {
                    const position = findAmbientSafePosition(resident.pos);
                    const entity = spawnEntityWithFallback("minecraft:villager_v2", "minecraft:villager", position, "", [AMBIENT_CIVILIAN_TAG, uniqueTag]);
                    if (!entity) {
                        throw new Error(`Unable to spawn civilian ${index + 1}/${AMBIENT_CIVILIANS.length}`);
                    }
                    applyProfession(entity, resident.professionEvent);
                    protectAmbientCivilian(entity);
                }
                else {
                    for (const entity of existing)
                        protectAmbientCivilian(entity);
                }
                safe(() => world.setDynamicProperty(AMBIENT_CIVILIAN_PROGRESS_PROPERTY, index + 1));
                await waitStoryTicks(1);
            }
        });
        if ((anchorIndex + 1) % 10 === 0 || anchorIndex === 49) {
            const completed = Math.min((anchorIndex + 1) * residentsPerAnchor, AMBIENT_CIVILIANS.length);
        }
    }
    safe(() => world.setDynamicProperty(AMBIENT_CIVILIAN_COMPLETE_PROPERTY, AMBIENT_CIVILIAN_VERSION));
}
function ensureAmbientCivilianPopulation(player) {
    if (ambientCivilianPromise)
        return ambientCivilianPromise;
    const current = buildAmbientCivilianPopulation(player);
    ambientCivilianPromise = current;
    current.catch((error) => {
    }).finally(() => {
        if (ambientCivilianPromise === current)
            ambientCivilianPromise = undefined;
    });
    return current;
}
function openStartGate() {
    const dim = dimension();
    let changed = 0;
    for (let x = START_GATE.min.x; x <= START_GATE.max.x; x += 1) {
        for (let y = START_GATE.min.y; y <= START_GATE.max.y; y += 1) {
            for (let z = START_GATE.min.z; z <= START_GATE.max.z; z += 1) {
                const block = safe(() => dim.getBlock({ x, y, z }), undefined);
                if (!block)
                    continue;
                if (!isAirLike(block.typeId)) {
                    safe(() => block.setType("minecraft:air"));
                    changed += 1;
                }
            }
        }
    }
    return changed;
}
function scheduleGateOpening() {
    openStartGate();
    system.runTimeout(() => openStartGate(), 20);
    system.runTimeout(() => openStartGate(), 60);
}
function openPalaceWave3Passage() {
    const dim = dimension();
    let changed = 0;
    for (let x = PALACE_WAVE3_OPENING.min.x; x <= PALACE_WAVE3_OPENING.max.x; x += 1) {
        for (let y = PALACE_WAVE3_OPENING.min.y; y <= PALACE_WAVE3_OPENING.max.y; y += 1) {
            for (let z = PALACE_WAVE3_OPENING.min.z; z <= PALACE_WAVE3_OPENING.max.z; z += 1) {
                const block = safe(() => dim.getBlock({ x, y, z }), undefined);
                if (!block || isAirLike(block.typeId))
                    continue;
                safe(() => block.setType("minecraft:air"));
                changed += 1;
            }
        }
    }
    safe(() => world.setDynamicProperty(PALACE_WAVE3_OPEN_PROPERTY, true));
    return changed;
}
function schedulePalaceWave3Opening() {
    openPalaceWave3Passage();
    system.runTimeout(() => openPalaceWave3Passage(), 20);
    system.runTimeout(() => openPalaceWave3Passage(), 60);
}
async function finishPalaceDefence(player) {
    if (getStage(player) !== 8 || hasTag(player, "eoh_delhi_wave3_transitioning"))
        return;
    safe(() => player.addTag("eoh_delhi_wave3_transitioning"));
    try {
        await repairPalaceTrapdoorsAfterWave3(player);
        schedulePalaceWave3Opening();
        setStage(player, 9);
        showTitle(player, "§6The Throne Hall", "§eDefeat Commander Qadir");
        playQuestSound(player);
        safe(() => player.sendMessage("§6Captain Zayd: §fThe blue soldiers cannot help inside the palace. They must hold the outer road and protect the wounded. The throne hall is yours to enter alone."));
        await playPalaceOpeningCutscene(player);
    }
    catch (error) {
    }
    finally {
        safe(() => player.removeTag("eoh_delhi_wave3_transitioning"));
    }
}
function shouldRemoveFromSpawnArea(block) {
    const id = String(block?.typeId ?? "").toLowerCase();
    const isSign = id.includes("sign");
    const isChest = CHEST_TYPES.has(id);
    if (!isSign && !isChest)
        return false;
    const below = safe(() => dimension().getBlock({
        x: block.location.x,
        y: block.location.y - 1,
        z: block.location.z,
    }), undefined);
    return below?.typeId === "minecraft:gravel";
}
let spawnCleanupRunning = false;
function scheduleSpawnAreaCleanup() {
    const alreadyCleaned = safe(() => world.getDynamicProperty(SPAWN_CLEANUP_PROPERTY) === true, false);
    if (alreadyCleaned || spawnCleanupRunning)
        return;
    spawnCleanupRunning = true;
    const dim = dimension();
    const centreX = Math.floor(SPAWN_POS.x);
    const centreZ = Math.floor(SPAWN_POS.z);
    const minX = centreX - SPAWN_CLEANUP_RADIUS;
    const maxX = centreX + SPAWN_CLEANUP_RADIUS;
    const minZ = centreZ - SPAWN_CLEANUP_RADIUS;
    const maxZ = centreZ + SPAWN_CLEANUP_RADIUS;
    const radiusSquared = SPAWN_CLEANUP_RADIUS * SPAWN_CLEANUP_RADIUS;
    let x = minX;
    let y = SPAWN_CLEANUP_MIN_Y;
    let z = minZ;
    let removedBlocks = 0;
    const advance = () => {
        y += 1;
        if (y <= SPAWN_CLEANUP_MAX_Y)
            return;
        y = SPAWN_CLEANUP_MIN_Y;
        z += 1;
        if (z <= maxZ)
            return;
        z = minZ;
        x += 1;
    };
    const processBatch = () => {
        let checked = 0;
        while (x <= maxX && checked < 4500) {
            const dx = x - centreX;
            const dz = z - centreZ;
            if ((dx * dx) + (dz * dz) <= radiusSquared) {
                const block = safe(() => dim.getBlock({ x, y, z }), undefined);
                if (block && shouldRemoveFromSpawnArea(block)) {
                    safe(() => block.setType("minecraft:air"));
                    removedBlocks += 1;
                }
            }
            checked += 1;
            advance();
        }
        if (x <= maxX) {
            system.run(processBatch);
            return;
        }
        safe(() => world.setDynamicProperty(SPAWN_CLEANUP_PROPERTY, true));
        spawnCleanupRunning = false;
        for (const player of world.getPlayers()) {
            if (distance(player.location, SPAWN_POS) <= 70) {
                safe(() => player.sendMessage(`§7Spawn cleanup removed ${removedBlocks} gravel-supported sign/chest blocks. All other signs, chests, lecterns, bookshelves, and loose books were preserved.`));
            }
        }
    };
    system.run(processBatch);
}
function migrateLegacyStoryEntitiesOnce() {
    const migrated = safe(() => world.getDynamicProperty(LEGACY_ENTITY_MIGRATION_PROPERTY) === true, false);
    if (migrated)
        return;
    for (const entity of safe(() => [...dimension().getEntities()], [])) {
        const tags = safe(() => entity.getTags(), []);
        const typeId = safe(() => entity.typeId, "");
        const isLegacy = typeId.startsWith("maurya:") ||
            tags.some((tag) => tag === "maurya_npc" || tag === "maurya_guard" || tag === "maurya_enemy");
        if (isLegacy)
            safe(() => entity.remove());
    }
    safe(() => world.setDynamicProperty(LEGACY_ENTITY_MIGRATION_PROPERTY, true));
}
function initializePlayer(player) {
    if (hasTag(player, INIT_TAG))
        return;
    for (const legacyTag of LEGACY_INIT_TAGS) {
        if (hasTag(player, legacyTag))
            safe(() => player.removeTag(legacyTag));
    }
    clearTagsByPrefix(player, [
        STAGE_PREFIX,
        "maurya_stage_",
        "maurya_clue_",
        "maurya_evidence_",
        "maurya_siege_",
        "maurya_council_",
        "maurya_boss_",
        "maurya_gift_",
        "maurya_healer_",
        "maurya_starter_",
        "eoh_delhi_clue_",
        "eoh_delhi_evidence_",
        "eoh_delhi_siege_",
        "eoh_delhi_council_",
        "eoh_delhi_boss_",
        "eoh_delhi_gift_",
        "eoh_delhi_healer_",
        "eoh_delhi_starter_",
    ]);
    safe(() => player.addTag(INIT_TAG));
    setStage(player, 0);
    removeNamedItem(player, "§r§eDelhi Quest Journal");
    removeNamedItem(player, "§r§6Royal Seal of Delhi");
    removeNamedItem(player, "§r§6Royal Seal of Delhi");
    const overworld = dimension();
    safe(() => player.setGameMode(GameMode.Adventure));
    safe(() => player.teleport(SPAWN_POS, { dimension: overworld }));
    safe(() => player.setSpawnPoint({
        dimension: overworld,
        x: 160,
        y: -59,
        z: 527,
    }));
    giveStarterKit(player);
    system.runTimeout(() => {
        showTitle(player, "§6Delhi Sultanate", "§eThe Stolen Royal Seal");
        safe(() => player.sendMessage("§6[Story] §fThe adventure is set in the real Delhi Sultanate during the reign of Sultan Alauddin Khalji. The Royal Seal has been stolen by conspirators inside the city walls."));
        safe(() => player.sendMessage("§eSpeak with Captain Zayd outside the closed southern gate. The gate will open only after you accept his mission."));
        playIntroCutscene(player)
            .then(() => showIntro(player))
            .catch(() => showIntro(player));
    }, 30);
}
async function showIntro(player) {
    const form = new ActionFormData()
        .title("§6Delhi Sultanate")
        .body("The Royal Seal was stolen while the Delhi Sultanate prepared its defences. Captain Zayd has sealed the southern gate because the conspirators are still inside the city.\n\nMeet 50 named citizens across four kingdom parts, travel among 200 additional residents, collect the required testimony, protect the mosque square, and stop Commander Qadir.")
        .button("Begin at the southern gate");
    try {
        await form.show(player);
    }
    catch (error) {
        // Captain Zayd remains available if another screen was open.
    }
}
function objectiveText(player) {
    const stage = getStage(player);
    const quest = QUESTS[stage] ?? QUESTS[0];
    if (stage === 6) {
        return `${quest.objective} §7(${countEntities("eoh_delhi_council_enemy")} remaining)`;
    }
    if (stage === 8) {
        const wave = hasTag(player, "eoh_delhi_siege_wave3")
            ? 3
            : hasTag(player, "eoh_delhi_siege_wave2")
                ? 2
                : 1;
        return `Palace defence: wave ${wave}/3, ${countEntities("eoh_delhi_siege_enemy")} red soldiers remaining.`;
    }
    if (stage === 9) {
        const bosses = getEntitiesByTag("eoh_delhi_commander");
        if (bosses.length > 0) {
            const health = safe(() => bosses[0].getComponent("minecraft:health"), undefined);
            const current = Math.max(0, Math.ceil(health?.currentValue ?? 0));
            const maximum = Math.ceil(health?.effectiveMax ?? health?.defaultValue ?? 140);
            return `Commander Qadir: ${current}/${maximum} health`;
        }
    }
    return quest.objective;
}
function updateActionBar(player) {
    const stage = getStage(player);
    const quest = QUESTS[stage] ?? QUESTS[0];
    const target = quest.target;
    let suffix = "";
    if (target)
        suffix = ` §8• §7${Math.round(distance(player.location, target))} blocks`;
    safe(() => player.onScreenDisplay.setActionBar(`§6${quest.name} §8| §f${objectiveText(player)}${suffix}`));
}
async function showQuestJournal(player) {
    const stage = getStage(player);
    const quest = QUESTS[stage] ?? QUESTS[0];
    const evidence = EVIDENCE_TAGS.filter((tag) => hasTag(player, tag)).length;
    const form = new ActionFormData()
        .title("§6Delhi Quest Journal")
        .body(`§e${quest.name}\n\n§f${objectiveText(player)}\n\n§7Citizen testimonies: ${evidence}/4\n§7Population: 50 named citizens + 200 additional villagers\n\n§7All evidence now comes from conversations. Walking near a location cannot complete it.`)
        .button("Close")
        .button("Restart adventure");
    try {
        const response = await form.show(player);
        if (!response.canceled && response.selection === 1)
            confirmRestart(player);
    }
    catch (error) {
        safe(() => player.sendMessage(`§eCurrent objective: §f${objectiveText(player)}`));
    }
}
async function confirmRestart(player) {
    const form = new MessageFormData()
        .title("Restart Adventure?")
        .body("This resets your quest progress. Active combat is preserved when another player is participating. The physical start gate remains open after it has been unlocked.")
        .button1("Restart")
        .button2("Cancel");
    try {
        const response = await form.show(player);
        if (!response.canceled && response.selection === 0)
            restartAdventure(player);
    }
    catch (error) {
        // The player can type !restart again.
    }
}
function restartAdventure(player) {
    const otherActivePlayers = world.getPlayers().some((other) => other.id !== player.id && getStage(other) >= 6 && getStage(other) <= 9);
    if (!otherActivePlayers)
        removeStoryEnemies();
    clearTagsByPrefix(player, [
        STAGE_PREFIX,
        "eoh_delhi_evidence_",
        "eoh_delhi_siege_",
        "eoh_delhi_council_",
        "eoh_delhi_boss_",
    ]);
    setStage(player, 0);
    removeNamedItem(player, "§r§6Royal Seal of Delhi");
    safe(() => player.teleport(SPAWN_POS, { dimension: dimension() }));
    giveStarterKit(player);
    showTitle(player, "§6Adventure Restarted", "§eSpeak with Captain Zayd");
}
function spawnEntityWithFallback(typeId, fallbackTypeId, pos, name, tags) {
    const safePos = findSafePosition(pos);
    let entity = safe(() => dimension().spawnEntity(typeId, safePos), undefined);
    if (!entity && fallbackTypeId) {
        entity = safe(() => dimension().spawnEntity(fallbackTypeId, safePos), undefined);
    }
    if (!entity)
        return undefined;
    safe(() => {
        entity.nameTag = name;
    });
    for (const tag of tags)
        safe(() => entity.addTag(tag));
    return entity;
}
function getEntitiesByTag(tag) {
    return safe(() => [...dimension().getEntities({ tags: [tag] })], []);
}
function countEntities(tag) {
    return getEntitiesByTag(tag).length;
}
function npcIsEligible(npc) {
    const palacePhase = world.getPlayers().some((player) => getStage(player) >= 7);
    if (npc.id === "captain_gate")
        return !palacePhase;
    if (npc.id === "captain_palace")
        return palacePhase;
    return true;
}
function applyProfession(entity, eventName) {
    if (!eventName)
        return;
    safe(() => entity.triggerEvent(eventName));
}
function protectNpc(entity) {
    safe(() => entity.addEffect("minecraft:resistance", 240, { amplifier: 255, showParticles: false }));
    safe(() => entity.addEffect("minecraft:regeneration", 240, { amplifier: 10, showParticles: false }));
    safe(() => entity.addEffect("minecraft:slowness", 240, { amplifier: 255, showParticles: false }));
}
function removePalaceBlueGuards() {
    for (const entity of getEntitiesByTag("eoh_delhi_guard")) {
        const tags = safe(() => entity.getTags(), []);
        const isPalaceGuard = tags.some((tag) => tag.startsWith("eoh_delhi_guard_palace_") || tag.startsWith("eoh_delhi_guard_court_"));
        if (isPalaceGuard)
            safe(() => entity.remove());
    }
}
function ensureNamedEntities() {
    removePalaceBlueGuards();
    for (const npc of NPCS) {
        const tag = `eoh_delhi_npc_${npc.id}`;
        const found = getEntitiesByTag(tag);
        if (!npcIsEligible(npc)) {
            for (const entity of found)
                safe(() => entity.remove());
            continue;
        }
        if (found.length > 1) {
            for (let index = 1; index < found.length; index += 1)
                safe(() => found[index].remove());
        }
        if (found.length === 0) {
            const entity = spawnEntityWithFallback("minecraft:villager_v2", "minecraft:villager", npc.pos, npc.name, ["eoh_delhi_npc", tag]);
            if (entity) {
                applyProfession(entity, npc.professionEvent);
                protectNpc(entity);
            }
        }
    }
    for (const guard of ACTIVE_BLUE_GUARDS) {
        const tag = `eoh_delhi_guard_${guard.id}`;
        const found = getEntitiesByTag(tag);
        if (found.length > 1) {
            for (let index = 1; index < found.length; index += 1)
                safe(() => found[index].remove());
        }
        if (found.length === 0) {
            spawnEntityWithFallback("eoh:royal_guard", "minecraft:iron_golem", guard.pos, guard.name, ["eoh_delhi_guard", tag]);
        }
    }
}
function maintainNpcsAndGuards() {
    for (const npc of NPCS) {
        const tag = `eoh_delhi_npc_${npc.id}`;
        for (const entity of getEntitiesByTag(tag)) {
            protectNpc(entity);
            const fixedPos = findSafePosition(npc.pos);
            if (distance(entity.location, fixedPos) > 1.5) {
                safe(() => entity.teleport(fixedPos, { dimension: dimension() }));
            }
        }
    }
    const activeEnemies = countEntities("eoh_delhi_enemy") > 0;
    for (const guard of ACTIVE_BLUE_GUARDS) {
        const tag = `eoh_delhi_guard_${guard.id}`;
        for (const entity of getEntitiesByTag(tag)) {
            safe(() => entity.addEffect("minecraft:resistance", 240, { amplifier: 0, showParticles: false }));
            if (!activeEnemies) {
                const fixedPos = findSafePosition(guard.pos);
                if (distance(entity.location, fixedPos) > 6) {
                    safe(() => entity.teleport(fixedPos, { dimension: dimension() }));
                }
            }
        }
    }
}
function npcIdFromEntity(entity) {
    const tag = safe(() => entity.getTags().find((entry) => entry.startsWith("eoh_delhi_npc_")), undefined);
    return tag?.slice("eoh_delhi_npc_".length);
}
async function simpleDialogue(player, title, body, button, onSelect) {
    try {
        const response = await new ActionFormData()
            .title(title)
            .body(body)
            .button(button)
            .show(player);
        if (!response.canceled && response.selection === 0 && onSelect)
            onSelect();
    }
    catch (error) {
        safe(() => player.sendMessage(`§e${title}: §f${body}`));
    }
}
function grantProfessionGift(player, npc) {
    const tag = `eoh_delhi_gift_${npc.id}`;
    if (hasTag(player, tag))
        return false;
    safe(() => player.addTag(tag));
    if (npc.specialGift === "quran") {
        giveSignedBook(player, "Al-Quran", [
            "In the name of Allah, the Most Compassionate, the Most Merciful.",
            "A respected holy book from the Great Mosque of the Delhi Sultanate. Keep it safe and treat it with respect.",
        ], {
            author: "Allah",
            displayName: "§r§aAl-Quran",
            lore: ["§7Gift from Imam Hamid", "§7Fixed author as requested"],
        });
        return true;
    }
    if (npc.specialGift === "city_guide") {
        giveSignedBook(player, "City Guide", [
            "Southern Gate: Captain Zayd and the public supply area.",
            "Great Mosque: Imam Hamid and Scholar Safiya.",
            "Northern Market: merchants, blacksmith, butcher, and library.",
        ], {
            displayName: "§r§bDelhi City Guide",
            lore: ["§7Author selected randomly"],
        });
        return true;
    }
    if (npc.specialGift === "history_book") {
        giveSignedBook(player, "City History", [
            "Delhi was the capital of a real medieval sultanate shaped by fortified settlements, markets, mosques, reservoirs, farms, soldiers, scholars, and Indo-Persian court culture.",
            "The Sultanate Guard protects citizens. Red uniforms belong to Commander Qadir's rebels.",
        ], {
            displayName: "§r§bHistory of the Delhi Sultanate",
            lore: ["§7Author selected randomly"],
        });
        return true;
    }
    for (const gift of npc.gift ?? []) {
        giveItem(player, gift.typeId, gift.amount, gift.name, [`§7Gift from ${npc.name.replace(/§./g, "")}`, `§7Profession: ${npc.role}`]);
    }
    return (npc.gift?.length ?? 0) > 0;
}
function giveEvidenceBook(player, tag, title, pages, displayName) {
    if (hasTag(player, tag))
        return;
    safe(() => player.addTag(tag));
    giveSignedBook(player, title, pages, {
        displayName,
        lore: ["§7Citizen testimony", "§7Author selected randomly"],
    });
}
function handleNpcInteraction(player, npcId) {
    const stage = getStage(player);
    const npc = NPCS.find((entry) => entry.id === npcId);
    if (npc) {
        const gifted = grantProfessionGift(player, npc);
        if (gifted)
            safe(() => player.sendMessage(`§a[Profession Gift] §f${npc.name.replace(/§./g, "")} gave you useful supplies.`));
    }
    if (npcId === "captain_gate") {
        if (stage === 0) {
            simpleDialogue(player, "Captain Zayd", "The Royal Seal was stolen before Sultan Alauddin Khalji's oath. I sealed this gate because the traitors are inside the kingdom. Speak with the citizens and bring their written testimony to Scholar Safiya at the mosque. Accept the mission and I will open the gate now.", "Accept mission and open gate", () => {
                if (getStage(player) !== 0)
                    return;
                setStage(player, 1);
                giveStarterKit(player);
                scheduleGateOpening();
                showTitle(player, "§6Gate Opened", "§eSpeak with Baker Zainab");
                playQuestSound(player);
            });
        }
        else {
            simpleDialogue(player, "Captain Zayd", stage >= 7
                ? "My command post is now at the palace gate. The Sultanate Guard is ready."
                : "The gate is open. Question the citizens; do not search for invisible evidence markers.", "Close");
        }
        return;
    }
    if (npcId === "baker_zainab") {
        if (stage === 1) {
            simpleDialogue(player, "Baker Zainab", "Before dawn I saw red-uniformed soldiers move sealed crates from the gate road toward the eastern farms. I wrote everything down for Scholar Safiya.", "Take Zainab's testimony", () => {
                giveEvidenceBook(player, "eoh_delhi_evidence_baker", "Night Witness", [
                    "I saw Commander Qadir's red soldiers carrying sealed crates before dawn.",
                    "They entered through the southern road and turned toward the eastern farms.",
                ], "§r§eZainab's Testimony");
                setStage(player, 2);
                showTitle(player, "§6Testimony Collected", "§eSpeak with Farmer Yusuf");
                playQuestSound(player);
            });
        }
        else {
            simpleDialogue(player, "Baker Zainab", "The southern district is calmer now. Please take bread for the road.", "Close");
        }
        return;
    }
    if (npcId === "farmer_yusuf") {
        if (stage === 2) {
            simpleDialogue(player, "Farmer Yusuf", "The red soldiers crossed my fields and exchanged the crates for carts marked with the northern market seal. Their officer dropped this written supply record.", "Take the farm record", () => {
                giveEvidenceBook(player, "eoh_delhi_evidence_farmer", "Supply Record", [
                    "Four sealed crates were transferred from the eastern farms to the northern market.",
                    "The order bears Commander Qadir's private crescent stamp.",
                ], "§r§aYusuf's Farm Record");
                setStage(player, 3);
                showTitle(player, "§6New Lead", "§eQuestion Merchant Amina");
                playQuestSound(player);
            });
        }
        else {
            simpleDialogue(player, "Farmer Yusuf", "The farms feed the kingdom. Take what you need, but protect the people.", "Close");
        }
        return;
    }
    if (npcId === "merchant_amina") {
        if (stage === 3) {
            simpleDialogue(player, "Merchant Amina", "I refused to sell weapons to the red soldiers. They paid another trader with palace coins and sent the order to Blacksmith Hamza. I recorded the transaction in my market ledger.", "Take the market ledger", () => {
                giveEvidenceBook(player, "eoh_delhi_evidence_merchant", "Market Ledger", [
                    "Payment received in palace-minted coins for weapons and red uniforms.",
                    "The buyer identified himself as an officer serving Commander Qadir.",
                ], "§r§eAmina's Market Ledger");
                setStage(player, 4);
                showTitle(player, "§6The Weapon Order", "§eSpeak with Blacksmith Hamza");
                playQuestSound(player);
            });
        }
        else {
            simpleDialogue(player, "Merchant Amina", "The market supports Sultan Alauddin Khalji and the Sultanate Guard.", "Close");
        }
        return;
    }
    if (npcId === "blacksmith_hamza") {
        if (stage === 4) {
            simpleDialogue(player, "Blacksmith Hamza", "I rejected Qadir's secret order, but I kept a copy. It commands the rebels to attack the mosque square first, then seize the palace. Take it to Scholar Safiya immediately.", "Take the weapon order", () => {
                giveEvidenceBook(player, "eoh_delhi_evidence_blacksmith", "Weapon Order", [
                    "Arm the Red Guard and assemble at the mosque square.",
                    "After the scholar is silenced, march north to the royal palace. Signed: Commander Qadir.",
                ], "§r§6Qadir's Weapon Order");
                setStage(player, 5);
                showTitle(player, "§6Evidence Complete", "§eGo to Scholar Safiya at the mosque");
                playQuestSound(player);
            });
        }
        else {
            simpleDialogue(player, "Blacksmith Hamza", "My shield is made for the Sultanate Guard. Use it well.", "Close");
        }
        return;
    }
    if (npcId === "scholar_safiya") {
        if (stage === 5) {
            const missing = EVIDENCE_TAGS.filter((tag) => !hasTag(player, tag));
            if (missing.length > 0) {
                simpleDialogue(player, "Court Scholar Safiya", `You are missing ${missing.length} citizen testimonies. Speak with every witness first.`, "Close");
                return;
            }
            simpleDialogue(player, "Court Scholar Safiya", "These four testimonies prove Commander Qadir stole the Royal Seal and armed a Red Guard rebellion. I will issue a royal decree—wait, his soldiers are gathering together in the mosque square!", "Read the decree and defend the square", () => {
                if (getStage(player) !== 5)
                    return;
                giveSignedBook(player, "Sultanic Decree", [
                    "Commander Qadir is charged with treason against Sultan Alauddin Khalji and the citizens of the Delhi Sultanate.",
                    "The Sultanate Guard is authorised to defend the mosque, palace, and people.",
                ], {
                    displayName: "§r§bSultanic Decree",
                    lore: ["§7Author selected randomly"],
                });
                setStage(player, 6);
                safe(() => player.addTag("eoh_delhi_council_started"));
                spawnCouncilBattle();
                showTitle(player, "§cRed Guard Attack", "§eDefend the mosque square");
            });
        }
        else if (stage < 5) {
            simpleDialogue(player, "Court Scholar Safiya", "Bring me testimony from the baker, farmer, merchant, and blacksmith.", "Close");
        }
        else {
            simpleDialogue(player, "Court Scholar Safiya", "The decree is safe. Now defend Sultan Alauddin Khalji and the palace.", "Close");
        }
        return;
    }
    if (npcId === "imam_hamid") {
        safe(() => player.addEffect("minecraft:regeneration", 160, { amplifier: 1, showParticles: false }));
        simpleDialogue(player, "Imam Hamid", "May peace remain within the kingdom. I have given you a respectfully named copy of Al-Quran. Unlike every other book, its author is fixed rather than random.", "Close");
        return;
    }
    if (npcId === "healer_maryam") {
        safe(() => player.addEffect("minecraft:regeneration", 200, { amplifier: 2, showParticles: true }));
        simpleDialogue(player, "Healer Maryam", "I have treated your injuries. My medicine is a one-time profession gift.", "Thank you");
        return;
    }
    if (npcId === "captain_palace") {
        if (stage === 7) {
            simpleDialogue(player, "Captain Zayd", "All red soldiers will enter from one fixed rally point on the palace road. My blue soldiers cannot follow you into the inner palace; they must hold this road, protect the wounded, and stop reinforcements. Defeat three waves, then enter the throne hall alone.", "Begin the palace defence", () => {
                if (getStage(player) !== 7)
                    return;
                clearTagsByPrefix(player, ["eoh_delhi_siege_"]);
                setStage(player, 8);
                safe(() => player.addTag("eoh_delhi_siege_wave1"));
                spawnSiegeWave(1);
                showTitle(player, "§cPalace Defence", "§eWave 1 of 3");
            });
        }
        else {
            simpleDialogue(player, "Captain Zayd", "My blue soldiers can hold the outer palace road, but they cannot help you inside the palace. Qadir has sealed the inner route.", "Close");
        }
        return;
    }
    if (npcId === "sultan_alauddin") {
        if (stage === 10 && hasNamedItem(player, "§r§6Royal Seal of Delhi")) {
            simpleDialogue(player, "Sultan Alauddin Khalji", "You listened to the citizens, protected the mosque, defended the palace, and recovered the Royal Seal. I name you Defender of Delhi.", "Return the Royal Seal", () => completeAdventure(player));
        }
        else if (stage < 10) {
            simpleDialogue(player, "Sultan Alauddin Khalji", "The palace is not safe. Stop Commander Qadir and recover the Royal Seal.", "Close");
        }
        else {
            simpleDialogue(player, "Sultan Alauddin Khalji", "Commander Qadir carried the signet. Recover it before returning to me.", "Close");
        }
        return;
    }
    if (npc) {
        simpleDialogue(player, npc.name.replace(/§./g, ""), `I work as the kingdom's ${npc.role.toLowerCase()}${npc.district ? ` in the ${npc.district}` : ""}. My profession gift can be claimed once, and I support the Sultanate Guard against Qadir's red soldiers.`, "Close");
    }
}
function completeAdventure(player) {
    if (getStage(player) !== 10)
        return;
    removeNamedItem(player, "§r§6Royal Seal of Delhi");
    setStage(player, 11);
    safe(() => player.addTag(STORY_COMPLETE_TAG));
    safe(() => player.setDynamicProperty("eoh:delhi_story_complete", true));
    if (!hasItemType(player, "eoh:chronicle_of_delhi")) {
        giveItem(player, "eoh:chronicle_of_delhi", 1, "§r§6Chronicle of Delhi", ["§7The road home is now unlocked.", "§eUse this book to return to the Overworld."]);
    }
    giveItem(player, "minecraft:diamond_sword", 1, "§r§6Saif of Delhi", ["§7Awarded by Sultan Alauddin Khalji", "§eDefender of Delhi"]);
    safe(() => player.addLevels(10));
    showTitle(player, "§6Defender of Delhi", "§eThe Royal Seal has been restored");
    playQuestSound(player);
    safe(() => player.sendMessage("§6[Ending] §fThe mosque courtyard and palace return to peace. Captain Zayd's blue soldiers remain on the outer road while the Sultan names you Defender of Delhi. Your Chronicle can now return you to the Overworld, and every chest in the kingdom is unlocked for you."));
    void playEndingCutscene(player);
}
function spawnEnemy(pos, name, battleTag, boss = false) {
    const entity = spawnEntityWithFallback(boss ? "eoh:commander_qadir" : "eoh:rebel_soldier", "minecraft:vindicator", pos, name, ["eoh_delhi_enemy", battleTag, ...(boss ? ["eoh_delhi_commander"] : [])]);
    if (!entity)
        return undefined;
    if (boss) {
        safe(() => entity.addEffect("minecraft:strength", 12000, { amplifier: 1, showParticles: false }));
        safe(() => entity.addEffect("minecraft:resistance", 12000, { amplifier: 1, showParticles: false }));
    }
    return entity;
}
function formationPositions(center, count, columns = 4, spacing = 2) {
    const positions = [];
    const rows = Math.ceil(count / columns);
    const xStart = center.x - ((columns - 1) * spacing) / 2;
    const zStart = center.z - ((rows - 1) * spacing) / 2;
    for (let index = 0; index < count; index += 1) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        positions.push({
            x: xStart + column * spacing,
            y: center.y,
            z: zStart + row * spacing,
        });
    }
    return positions;
}
function spawnFixedFormation(center, count, battleTag, namePrefix, columns = 4) {
    const positions = formationPositions(center, count, columns, 2);
    positions.forEach((pos, index) => {
        spawnEnemy(pos, `§r§c${namePrefix} ${index + 1}`, battleTag);
    });
}
function spawnCouncilBattle() {
    if (countEntities("eoh_delhi_council_enemy") > 0)
        return;
    spawnFixedFormation({ x: 120.5, y: -59, z: 371.5 }, 10, "eoh_delhi_council_enemy", "Red Soldier", 5);
}
function spawnSiegeWave(wave) {
    if (countEntities("eoh_delhi_siege_enemy") > 0)
        return;
    const counts = { 1: 10, 2: 12, 3: 14 };
    const count = counts[wave] ?? 10;
    spawnFixedFormation({ x: 152.5, y: -59, z: 251.5 }, count, "eoh_delhi_siege_enemy", `Red Guard W${wave}`, 5);
}
function spawnBossBattle() {
    if (countEntities("eoh_delhi_commander") > 0)
        return;
    spawnEnemy(POS.throne, "§r§4Commander Qadir", "eoh_delhi_throne_enemy", true);
    const guardCenter = { x: 159.5, y: -57, z: 160.5 };
    formationPositions(guardCenter, 6, 3, 3).forEach((pos, index) => {
        spawnEnemy(pos, `§r§4Qadir's Elite ${index + 1}`, "eoh_delhi_throne_enemy");
    });
}
function removeStoryEnemies() {
    for (const entity of getEntitiesByTag("eoh_delhi_enemy"))
        safe(() => entity.remove());
}
function updateQuestProgress(player) {
    const stage = getStage(player);
    if (stage === 9 &&
        safe(() => world.getDynamicProperty("eoh:unclaimed_royal_seal_v20") === true, false) &&
        distance(player.location, POS.throne) <= 12) {
        if (giveImperialSignet(player)) {
            setStage(player, 10);
            safe(() => world.setDynamicProperty("eoh:unclaimed_royal_seal_v20", false));
            showTitle(player, "§6Royal Seal Recovered", "§eReturn it to Sultan Alauddin Khalji");
            playQuestSound(player);
            return;
        }
    }
    if (stage >= 1)
        openStartGate();
    if (stage === 6 && hasTag(player, "eoh_delhi_council_started")) {
        if (countEntities("eoh_delhi_council_enemy") === 0) {
            setStage(player, 7);
            showTitle(player, "§6Mosque Square Defended", "§eMeet Captain Zayd at the palace gate");
            playQuestSound(player);
            void playMosqueVictoryCutscene(player);
        }
    }
    if (stage === 8 && countEntities("eoh_delhi_siege_enemy") === 0) {
        if (!hasTag(player, "eoh_delhi_siege_wave2")) {
            safe(() => player.addTag("eoh_delhi_siege_wave2"));
            spawnSiegeWave(2);
            showTitle(player, "§cPalace Defence", "§eWave 2 of 3");
            safe(() => player.sendMessage("§6Captain Zayd: §fThe first rebel line is broken. Hold the road; my blue soldiers are evacuating the wounded."));
        }
        else if (!hasTag(player, "eoh_delhi_siege_wave3")) {
            safe(() => player.addTag("eoh_delhi_siege_wave3"));
            spawnSiegeWave(3);
            showTitle(player, "§cPalace Defence", "§eFinal wave");
            safe(() => player.sendMessage("§6Captain Zayd: §fFinal wave. The blue soldiers will keep the outer gate from falling, but the inner palace remains yours alone."));
        }
        else {
            void finishPalaceDefence(player);
        }
    }
    if (stage === 9 && distance(player.location, POS.throne) <= 22) {
        const bossMissing = countEntities("eoh_delhi_commander") === 0;
        if (bossMissing) {
            const firstStart = !hasTag(player, "eoh_delhi_boss_started");
            safe(() => player.addTag("eoh_delhi_boss_started"));
            spawnBossBattle();
            showTitle(player, "§4Commander Qadir", firstStart ? "§cThe Royal Seal belongs to me!" : "§cThe commander has returned to the throne hall!");
            if (firstStart)
                void playBossIntroCutscene(player);
        }
    }
}
const KINGDOM_LIMITS = { minX: -63, maxX: 382, minZ: -63, maxZ: 606 };
function keepPlayerInsideKingdom(player) {
    const location = player.location;
    const nearBoundary = location.x <= KINGDOM_LIMITS.minX + 2 ||
        location.x >= KINGDOM_LIMITS.maxX - 2 ||
        location.z <= KINGDOM_LIMITS.minZ + 2 ||
        location.z >= KINGDOM_LIMITS.maxZ - 2;
    if (nearBoundary) {
        safe(() => player.onScreenDisplay.setActionBar("§eConstruction is going on beyond this point."));
    }
    if (location.x < KINGDOM_LIMITS.minX || location.x > KINGDOM_LIMITS.maxX ||
        location.z < KINGDOM_LIMITS.minZ || location.z > KINGDOM_LIMITS.maxZ ||
        location.y < -70) {
        safe(() => player.teleport(SPAWN_POS, { dimension: dimension() }));
        safe(() => player.sendMessage("§eConstruction is going on beyond this point."));
    }
}
function canOpenChest(player, location) {
    if (isStoryComplete(player))
        return true;
    const stage = getStage(player);
    return PUBLIC_CHEST_ZONES.some((zone) => stage >= zone.minStage &&
        location.x >= zone.minX && location.x <= zone.maxX &&
        location.z >= zone.minZ && location.z <= zone.maxZ);
}
world.afterEvents.playerSpawn.subscribe((event) => {
    if (!inKingdom(event.player))
        return;
    restorePlayerControl(event.player);
    system.runTimeout(() => {
        void ensureAmbientCivilianPopulation(event.player);
        if (!hasTag(event.player, INIT_TAG)) {
            initializePlayer(event.player);
            system.runTimeout(() => ensureNamedEntities(), 10);
        }
        else {
            restoreStageCheckpoint(event.player, getStage(event.player));
            if (getStage(event.player) >= 9 || safe(() => world.getDynamicProperty(PALACE_WAVE3_OPEN_PROPERTY) === true, false)) {
                schedulePalaceWave3Opening();
            }
            if (isStoryComplete(event.player) && !hasItemType(event.player, "eoh:chronicle_of_delhi")) {
                giveItem(event.player, "eoh:chronicle_of_delhi", 1, "§r§6Chronicle of Delhi", ["§7Return to the Overworld is unlocked."]);
            }
        }
    }, 5);
});
world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    if (!inKingdom(event.player) || !hasTag(event.target, "eoh_delhi_npc"))
        return;
    event.cancel = true;
    const player = event.player;
    const npcId = npcIdFromEntity(event.target);
    if (!npcId)
        return;
    system.run(() => handleNpcInteraction(player, npcId));
});
world.beforeEvents.playerInteractWithBlock?.subscribe((event) => {
    if (!inKingdom(event.player))
        return;
    if (event.isFirstEvent === false)
        return;
    if (!CHEST_TYPES.has(event.block.typeId))
        return;
    if (canOpenChest(event.player, event.block.location))
        return;
    event.cancel = true;
    system.run(() => {
        safe(() => event.player.playSound("random.door_close", { volume: 0.8, pitch: 0.8 }));
        safe(() => event.player.sendMessage("§cPrivate chest: §fOnly marked public supply, market, Great-Mosque-library, and authorised palace chests can be opened before the story is completed. Complete the story to unlock every chest."));
    });
});
world.beforeEvents.chatSend?.subscribe((event) => {
    const message = event.message.trim().toLowerCase();
    if (message === "!history") {
        event.cancel = true;
        const player = event.sender;
        system.run(() => safe(() => player.sendMessage("§6[Historical Setting] §fThis adventure uses the real Delhi Sultanate and the reign of Sultan Alauddin Khalji (1296–1316). The stolen-seal conspiracy and most supporting characters are dramatized for gameplay.")));
        return;
    }
    if (!inKingdom(event.sender))
        return;
    if (message === "!quest" || message === "!q") {
        event.cancel = true;
        const player = event.sender;
        system.run(() => showQuestJournal(player));
    }
    else if (message === "!restart") {
        event.cancel = true;
        const player = event.sender;
        system.run(() => confirmRestart(player));
    }
});
world.beforeEvents.itemUse?.subscribe((event) => {
    if (!inKingdom(event.source))
        return;
    if (event.itemStack?.nameTag !== "§r§eDelhi Quest Journal")
        return;
    event.cancel = true;
    const player = event.source;
    system.run(() => showQuestJournal(player));
});
world.afterEvents.entityDie.subscribe((event) => {
    if (safe(() => event.deadEntity.dimension.id, "") !== DIMENSION_ID)
        return;
    const tags = safe(() => event.deadEntity.getTags(), []);
    const typeId = safe(() => event.deadEntity.typeId, "");
    const deadName = safe(() => event.deadEntity.nameTag, "");
    const isCommander = tags.includes("eoh_delhi_commander") ||
        typeId === "eoh:commander_qadir" ||
        deadName.includes("Commander Qadir");
    if (!isCommander)
        return;
    const deathLocation = safe(() => ({ ...event.deadEntity.location }), POS.throne);
    for (const entity of getEntitiesByTag("eoh_delhi_throne_enemy"))
        safe(() => entity.remove());
    let rewarded = 0;
    for (const player of world.getPlayers()) {
        if (!inKingdom(player) || getStage(player) !== 9)
            continue;
        if (distance(player.location, deathLocation) > 80)
            continue;
        if (!giveImperialSignet(player)) {
            safe(() => player.sendMessage("§cThe Royal Seal could not be delivered. Free one inventory slot and approach the throne again."));
            continue;
        }
        setStage(player, 10);
        showTitle(player, "§6Royal Seal Recovered", "§eReturn it to Sultan Alauddin Khalji");
        playQuestSound(player);
        rewarded += 1;
    }
    if (rewarded === 0) {
        safe(() => world.setDynamicProperty("eoh:unclaimed_royal_seal_v30", true));
    }
});
system.runInterval(() => {
    if (!world.getPlayers().some((player) => inKingdom(player)))
        return;
    ensureNamedEntities();
    maintainNpcsAndGuards();
}, 200);
system.runInterval(() => {
    for (const player of world.getPlayers()) {
        if (!inKingdom(player))
            continue;
        if (!hasTag(player, INIT_TAG))
            initializePlayer(player);
        updateQuestProgress(player);
        if (getStage(player) >= 9 || safe(() => world.getDynamicProperty(PALACE_WAVE3_OPEN_PROPERTY) === true, false)) {
            openPalaceWave3Passage();
        }
        updateActionBar(player);
        keepPlayerInsideKingdom(player);
    }
}, 20);
export function isStoryComplete(player) {
    return hasTag(player, STORY_COMPLETE_TAG) || getStage(player) >= 11 || safe(() => player.getDynamicProperty("eoh:delhi_story_complete") === true, false);
}
export function activateStoryDimension() {
    safe(() => world.setDynamicProperty(SPAWN_CLEANUP_PROPERTY, true));
    migrateLegacyStoryEntitiesOnce();
    removePalaceBlueGuards();
    if (safe(() => world.getDynamicProperty(PALACE_WAVE3_OPEN_PROPERTY) === true, false) ||
        world.getPlayers().some((player) => inKingdom(player) && getStage(player) >= 9)) {
        schedulePalaceWave3Opening();
    }
    ensureNamedEntities();
    const populationPlayer = world.getPlayers().find((player) => inKingdom(player));
    void ensureAmbientCivilianPopulation(populationPlayer);
}
export function enterStory(player) {
    const dim = dimension();
    safe(() => player.teleport(SPAWN_POS, { dimension: dim }));
    restoreStageCheckpoint(player, getStage(player));
    if (!hasTag(player, INIT_TAG)) {
        initializePlayer(player);
    }
    else {
        if (isStoryComplete(player) && !hasItemType(player, "eoh:chronicle_of_delhi")) {
            giveItem(player, "eoh:chronicle_of_delhi", 1, "§r§6Chronicle of Delhi", ["§7Return to the Overworld is unlocked."]);
        }
        showTitle(player, "§6Delhi Sultanate", isStoryComplete(player) ? "§eReturn journey unlocked" : "§eThe Stolen Royal Seal");
    }
    system.runTimeout(() => activateStoryDimension(), 10);
}
