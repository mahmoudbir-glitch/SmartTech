/*
 * SYRIATECH — بيانات المتجر
 * ===========================
 * المنتجات مستوردة من كتالوج المورّد (Anker · eufy · soundcore · Nebula · PITAKA · Kingston).
 * لا نصوص واجهة هنا — كل النصوص في i18n.js.
 * لا حاجة لتعديل هذا الملف يدوياً: كل تعديل من لوحة التحكم /admin.html يُطبَّق فوقه.
 */
(function () {
  const categories = [
    { id: "power-bank" },
    { id: "charger" },
    { id: "wireless" },
    { id: "cables" },
    { id: "hubs-docks" },
    { id: "power" },
    { id: "car" },
    { id: "audio" },
    { id: "security" },
    { id: "smart-home" },
    { id: "projector" },
    { id: "solar" },
    { id: "phone-cases" },
    { id: "accessories" }
  ];

  // Display order of the brands that have a tagline in i18n.js.
  const brands = ["Anker", "eufy", "soundcore", "Nebula", "Anker SOLIX", "PITAKA", "Kingston"];

  const settings = { whatsapp: "963982760670", email: "" };

  const products = [
    // power-bank
    {id:35141,category:"power-bank",brand:"Anker",name:"Prime Power Bank (26K, 300W)",sku:"A110AH11",oldPrice:229.99,price:229.99,image:"assets/products/35141.webp",inStock:true},
    {id:31084,category:"power-bank",brand:"Anker",name:"Prime Power Bank (20K, 220W)",sku:"A110BH11",oldPrice:179.99,price:179.99,image:"assets/products/31084.webp",inStock:true},
    {id:21346,category:"power-bank",brand:"Anker",name:"Power Bank (25K, 165W, Built-In and Retractable Cables)",sku:"A1695H11",oldPrice:134.99,price:134.99,image:"assets/products/21346.webp",inStock:true},
    {id:19311,category:"power-bank",brand:"Anker",name:"MagGo Power Bank (10K, Slim)",sku:"",oldPrice:74.99,price:74.99,image:"assets/products/19311.webp",inStock:false},
    {id:15551,category:"power-bank",brand:"Anker",name:"MagGo Power Bank (6.6K)",sku:"A1643H11",oldPrice:69.99,price:69.99,image:"assets/products/15551.webp",inStock:true},
    {id:30978,category:"power-bank",brand:"Anker",name:"Nano Power Bank (5K, MagGo, Slim)",sku:"",oldPrice:59.99,price:59.99,image:"assets/products/30978.webp",inStock:true},
    {id:26758,category:"power-bank",brand:"Anker",name:"Nano Power Bank (10K, 45W, Built-In Retractable USB-C Cable)",sku:"",oldPrice:59.99,price:59.99,image:"assets/products/26758.webp",inStock:true},
    {id:31024,category:"power-bank",brand:"Anker",name:"Zolo Power bank (20K, 22.5W, Built-In USB-C Cable)",sku:"A110EH11",oldPrice:44.99,price:44.99,image:"assets/products/31024.webp",inStock:true},
    {id:26735,category:"power-bank",brand:"Anker",name:"Zolo Power Bank (10K, 35W, Built-in Dual USB-C Cables)",sku:"",oldPrice:44.99,price:44.99,image:"assets/products/26735.webp",inStock:true},
    {id:33438,category:"power-bank",brand:"Anker",name:"Zolo Power Bank (10K, 30W, Built-in USB-C Cable)",sku:"",oldPrice:36.99,price:36.99,image:"assets/products/33438.webp",inStock:true},
    {id:32096,category:"power-bank",brand:"Anker",name:"Zolo Powerbank (10K, 22.5W, Built-in USB-C Cable)",sku:"A110DH11",oldPrice:29.99,price:29.99,image:"assets/products/32096.webp",inStock:true},
    // charger
    {id:23403,category:"charger",brand:"Anker",name:"Prime Charging Docking Station (14-in-1, Dual Display, 160W)",sku:"A83B63A1",oldPrice:269.99,price:269.99,image:"assets/products/23403.webp",inStock:true},
    {id:21319,category:"charger",brand:"Anker",name:"Prime Charger (250W, 6 Ports, GaNPrime)",sku:"A2345341",oldPrice:169.99,price:169.99,image:"assets/products/21319.webp",inStock:true},
    {id:31111,category:"charger",brand:"Anker",name:"Prime Charger (160W, 3 Ports)",sku:"A2687341",oldPrice:149.99,price:149.99,image:"assets/products/31111.webp",inStock:true},
    {id:19166,category:"charger",brand:"Anker",name:"Prime Charger (200W, 6 Ports, GaN)",sku:"A2683341",oldPrice:99.99,price:99.99,image:"assets/products/19166.webp",inStock:true},
    {id:21280,category:"charger",brand:"Anker",name:"Charger GaNPrime 100W",sku:"A2688341",oldPrice:84.99,price:84.99,image:"assets/products/21280.webp",inStock:true},
    {id:24967,category:"charger",brand:"Anker",name:"Laptop Charger (140W, 4-Port, PD 3.1) with USB-C Cable",sku:"B2697GZ1",oldPrice:109.99,price:74.99,image:"assets/products/24967.webp",inStock:true},
    {id:21301,category:"charger",brand:"Anker",name:"Charging Base 100W for Anker Prime Power Bank",sku:"A1902211",oldPrice:89.99,price:64.99,image:"assets/products/21301.webp",inStock:true},
    {id:26629,category:"charger",brand:"Anker",name:"Charger (112W, 6 Ports)",sku:"A2154K11",oldPrice:59.99,price:59.99,image:"assets/products/26629.webp",inStock:true},
    {id:35100,category:"charger",brand:"Anker",name:"Zolo Charger (70W, 4 Port)",sku:"A121CG11",oldPrice:44.99,price:44.99,image:"assets/products/35100.webp",inStock:true},
    {id:31005,category:"charger",brand:"Anker",name:"Nano Charger (100W) with USB-C Cable",sku:"B2679G11",oldPrice:44.99,price:44.99,image:"assets/products/31005.webp",inStock:true},
    {id:31061,category:"charger",brand:"Anker",name:"Nano Charger (35W, Built-In Retractable USB-C Cable)",sku:"A2658G11",oldPrice:39.99,price:39.99,image:"assets/products/31061.webp",inStock:true},
    {id:26586,category:"charger",brand:"Anker",name:"735 Charger (Nano II 65W)",sku:"A2667K14",oldPrice:39.99,price:39.99,image:"assets/products/26586.webp",inStock:true},
    {id:21379,category:"charger",brand:"Anker",name:"PowerExtend USB-C Travel Adapter (4 in 1, 3OW)",sku:"A9212K11",oldPrice:39.99,price:39.99,image:"assets/products/21379.webp",inStock:true},
    {id:24809,category:"charger",brand:"Anker",name:"Nano Charger (45W)",sku:"",oldPrice:34.99,price:34.99,image:"assets/products/24809.webp",inStock:true},
    {id:10347,category:"charger",brand:"Anker",name:"511 Charger (Nano 3, 30W)",sku:"A2147G21",oldPrice:24.99,price:24.99,image:"assets/products/10347.webp",inStock:true},
    {id:21270,category:"charger",brand:"Anker",name:"Zolo Charger (30W)",sku:"",oldPrice:19.99,price:19.99,image:"assets/products/21270.webp",inStock:true},
    {id:5979,category:"charger",brand:"Anker",name:"PowerPort PD+ 2",sku:"A2636L21",oldPrice:29.99,price:19.99,image:"assets/products/5979.webp",inStock:false},
    {id:35074,category:"charger",brand:"Anker",name:"Zolo Charger (20W)",sku:"",oldPrice:14.99,price:14.99,image:"assets/products/35074.webp",inStock:true},
    // wireless
    {id:25203,category:"wireless",brand:"Anker",name:"MagGo Wireless Charging Station (3-in-1, Dock Stand)",sku:"B25M4G11",oldPrice:99.99,price:99.99,image:"assets/products/25203.webp",inStock:true},
    {id:21413,category:"wireless",brand:"Anker",name:"MagGo Wireless Charging Station (3-in-1, Foldable Pad)",sku:"B25M8H11",oldPrice:99.99,price:99.99,image:"assets/products/21413.webp",inStock:true},
    {id:19289,category:"wireless",brand:"Anker",name:"MagGo Wireless Charger (2-in-1, Dock Stand)",sku:"A25M7H11",oldPrice:49.99,price:49.99,image:"assets/products/19289.webp",inStock:true},
    {id:28005,category:"wireless",brand:"Anker",name:"MagGo Wireless Charger (Stand)",sku:"A25X1H11",oldPrice:39.99,price:39.99,image:"assets/products/28005.webp",inStock:true},
    {id:25093,category:"wireless",brand:"Anker",name:"Car Magnetic Bracket",sku:"A9101H41",oldPrice:31.99,price:31.99,image:"assets/products/25093.webp",inStock:true},
    // cables
    {id:33883,category:"cables",brand:"Anker",name:"Prime Thunderbolt 5 Cable 1m",sku:"A84N1011",oldPrice:54.99,price:54.99,image:"assets/products/33883.webp",inStock:true},
    {id:21152,category:"cables",brand:"Anker",name:"Prime Thunderbolt 4 Cable 1m",sku:"A84N0011",oldPrice:54.99,price:44.99,image:"assets/products/21152.webp",inStock:true},
    {id:21117,category:"cables",brand:"Anker",name:"HDMI to HDMI Cable (8K, 6ft)",sku:"A8742H11",oldPrice:29.99,price:29.99,image:"assets/products/21117.webp",inStock:true},
    {id:21098,category:"cables",brand:"Anker",name:"Prime USB-C to USB-C Cable (240W, Upcycled-Braided)",sku:"",oldPrice:29.99,price:29.99,image:"assets/products/21098.webp",inStock:true},
    {id:11601,category:"cables",brand:"Anker",name:"USB-C to HDMI 4K Nylon Cable",sku:"A87E0H12",oldPrice:27.99,price:27.99,image:"assets/products/11601.webp",inStock:true},
    {id:19104,category:"cables",brand:"Anker",name:"2-in-1 USB C to USB C Cable 140W",sku:"",oldPrice:25.99,price:25.99,image:"assets/products/19104.webp",inStock:true},
    {id:21136,category:"cables",brand:"Anker",name:"USB-C to USB-C (3ft, 240W, 20 Gbps, Bio-Based)",sku:"A80N1H11",oldPrice:24.99,price:24.99,image:"assets/products/21136.webp",inStock:true},
    {id:19086,category:"cables",brand:"Anker",name:"USB-C to USB-C Cable (240W, Upcycled-Braided)",sku:"",oldPrice:21.99,price:21.99,image:"assets/products/19086.webp",inStock:true},
    {id:15791,category:"cables",brand:"Anker",name:"322 USB-C to Lightning Cable",sku:"",oldPrice:19.99,price:19.99,image:"assets/products/15791.webp",inStock:true},
    {id:21072,category:"cables",brand:"Anker",name:"Zolo USB-C to USB-C Cable (240W, Braided)",sku:"",oldPrice:17.99,price:17.99,image:"assets/products/21072.webp",inStock:true},
    {id:11593,category:"cables",brand:"Anker",name:"322 USB-C to USB-C Cable",sku:"",oldPrice:17.99,price:17.99,image:"assets/products/11593.webp",inStock:true},
    {id:9006,category:"cables",brand:"Anker",name:"543 USB-C to USB-C Cable (Bio-Based)",sku:"",oldPrice:16.99,price:16.99,image:"assets/products/9006.webp",inStock:true},
    {id:6035,category:"cables",brand:"Anker",name:"PowerLine Select+ USB-A to Lightning",sku:"A8012H12",oldPrice:13.99,price:13.99,image:"assets/products/6035.webp",inStock:true},
    {id:23345,category:"cables",brand:"Anker",name:"New Nylon USB-C to USB-C Cable",sku:"",oldPrice:11.99,price:11.99,image:"assets/products/23345.webp",inStock:true},
    {id:6940,category:"cables",brand:"Anker",name:"Powerline+ II USB-A to Lightning",sku:"A8452H13",oldPrice:19.99,price:11.99,image:"assets/products/6940.webp",inStock:true},
    {id:33413,category:"cables",brand:"Anker",name:"Premium Nylon USB-A to USB-C Cable (1.8m)",sku:"A8173H11",oldPrice:9.99,price:9.99,image:"assets/products/33413.webp",inStock:true},
    {id:7506,category:"cables",brand:"Anker",name:"Powerline III USB-A to Lightning",sku:"A8812H21",oldPrice:15.99,price:9.99,image:"assets/products/7506.webp",inStock:true},
    {id:10362,category:"cables",brand:"Anker",name:"322 USB-A to USB-C Cable",sku:"",oldPrice:8.99,price:8.99,image:"assets/products/10362.webp",inStock:true},
    {id:5990,category:"cables",brand:"Anker",name:"PowerLine Micro USB",sku:"A8132H12-21",oldPrice:8.99,price:4.99,image:"assets/products/5990.webp",inStock:true},
    // hubs-docks
    {id:19134,category:"hubs-docks",brand:"Anker",name:"USB-C Hub (14-in-1, Triple Display)",sku:"A8389HA1",oldPrice:89.99,price:89.99,image:"assets/products/19134.webp",inStock:true},
    {id:26545,category:"hubs-docks",brand:"Anker",name:"7-in-1 USB-C Hub",sku:"A8374AA1",oldPrice:49.99,price:49.99,image:"assets/products/26545.webp",inStock:true},
    {id:9101,category:"hubs-docks",brand:"Anker",name:"518 USB-C Adapter (8K HDMI)",sku:"A8317HA1",oldPrice:49.99,price:49.99,image:"assets/products/9101.webp",inStock:true},
    {id:8988,category:"hubs-docks",brand:"Anker",name:"541 USB-C Hub (6-in-1, for iPad)",sku:"",oldPrice:49.99,price:49.99,image:"assets/products/8988.webp",inStock:true},
    {id:30955,category:"hubs-docks",brand:"Anker",name:"USB-C Hub 7-in-1 Multi-Port USB Adapter for Laptops",sku:"A83D2HA1",oldPrice:29.99,price:29.99,image:"assets/products/30955.webp",inStock:true},
    {id:19119,category:"hubs-docks",brand:"Anker",name:"HDMI Switch (2 in 1 out)",sku:"A83H10A1",oldPrice:17.99,price:17.99,image:"assets/products/19119.webp",inStock:true},
    // car
    {id:23388,category:"car",brand:"Anker",name:"Nano Car Charger (167.5W, 3 Ports)",sku:"B2737HA1",oldPrice:64.99,price:64.99,image:"assets/products/23388.webp",inStock:true},
    {id:19364,category:"car",brand:"Anker",name:"MagSafe Wireless Car Charger (15W)",sku:"B2932111",oldPrice:59.99,price:59.99,image:"assets/products/19364.webp",inStock:true},
    {id:21232,category:"car",brand:"Anker",name:"Nano 75W Car Charger (Built-In Retractable USB-C Cable)",sku:"A2738HA2",oldPrice:39.99,price:39.99,image:"assets/products/21232.webp",inStock:true},
    {id:12936,category:"car",brand:"Anker",name:"323 Car Charger (52.5W)",sku:"A2735H11",oldPrice:24.99,price:24.99,image:"assets/products/12936.webp",inStock:true},
    {id:30941,category:"car",brand:"Anker",name:"Dual-Port Car Charger 30W",sku:"A2741H11",oldPrice:14.99,price:14.99,image:"assets/products/30941.webp",inStock:true},
    // audio
    {id:8503,category:"audio",brand:"Anker",name:"AnkerWork BR300 Video Bar and TV Mount Bundle",sku:"A3387011",oldPrice:779.99,price:779.99,image:"assets/products/8503.webp",inStock:true},
    {id:24780,category:"audio",brand:"soundcore",name:"Rave 3S Party Speaker with Microphone",sku:"A31A3012",oldPrice:449.99,price:449.99,image:"assets/products/24780.webp",inStock:true},
    {id:33522,category:"audio",brand:"soundcore",name:"Liberty 5 Pro Max",sku:"D1204H11",oldPrice:229.99,price:229.99,image:"assets/products/33522.webp",inStock:true},
    {id:12131,category:"audio",brand:"soundcore",name:"Motion X600",sku:"",oldPrice:199.99,price:199.99,image:"assets/products/12131.webp",inStock:true},
    {id:10259,category:"audio",brand:"soundcore",name:"Rave Neo 2",sku:"A33A1Z11",oldPrice:179.99,price:179.99,image:"assets/products/10259.webp",inStock:true},
    {id:19599,category:"audio",brand:"soundcore",name:"Space One Pro",sku:"",oldPrice:199.99,price:169.99,image:"assets/products/19599.webp",inStock:true},
    {id:15330,category:"audio",brand:"soundcore",name:"Motion X500",sku:"",oldPrice:169.99,price:169.99,image:"assets/products/15330.webp",inStock:true},
    {id:33497,category:"audio",brand:"soundcore",name:"Boom 3i",sku:"D5100010",oldPrice:129.99,price:129.99,image:"assets/products/33497.webp",inStock:true},
    {id:25161,category:"audio",brand:"soundcore",name:"Liberty 5",sku:"",oldPrice:129.99,price:129.99,image:"assets/products/25161.webp",inStock:true},
    {id:23320,category:"audio",brand:"soundcore",name:"AeroFit 2",sku:"",oldPrice:129.99,price:129.99,image:"assets/products/23320.webp",inStock:true},
    {id:24737,category:"audio",brand:"soundcore",name:"AeroClip",sku:"",oldPrice:169.99,price:119.99,image:"assets/products/24737.webp",inStock:true},
    {id:19521,category:"audio",brand:"soundcore",name:"Sport X20",sku:"A3968H11",oldPrice:89.99,price:89.99,image:"assets/products/19521.webp",inStock:true},
    {id:33470,category:"audio",brand:"soundcore",name:"Boom Go 3i",sku:"D5103010",oldPrice:79.99,price:79.99,image:"assets/products/33470.webp",inStock:true},
    {id:15445,category:"audio",brand:"soundcore",name:"Space One",sku:"",oldPrice:99.99,price:69.99,image:"assets/products/15445.webp",inStock:true},
    {id:19575,category:"audio",brand:"soundcore",name:"Q20i ANC",sku:"",oldPrice:69.99,price:54.99,image:"assets/products/19575.webp",inStock:true},
    {id:26522,category:"audio",brand:"soundcore",name:"Q11i",sku:"",oldPrice:49.99,price:49.99,image:"assets/products/26522.webp",inStock:true},
    {id:21562,category:"audio",brand:"soundcore",name:"Select 3",sku:"A3172G11",oldPrice:49.99,price:49.99,image:"assets/products/21562.webp",inStock:true},
    {id:19453,category:"audio",brand:"soundcore",name:"R50i NC",sku:"",oldPrice:49.99,price:49.99,image:"assets/products/19453.webp",inStock:true},
    {id:35118,category:"audio",brand:"soundcore",name:"R60i NC",sku:"",oldPrice:44.99,price:44.99,image:"assets/products/35118.webp",inStock:true},
    {id:23271,category:"audio",brand:"soundcore",name:"H30i",sku:"",oldPrice:39.99,price:31.99,image:"assets/products/23271.webp",inStock:true},
    {id:24723,category:"audio",brand:"soundcore",name:"P25i",sku:"",oldPrice:29.99,price:29.99,image:"assets/products/24723.webp",inStock:true},
    {id:21500,category:"audio",brand:"soundcore",name:"K20i",sku:"",oldPrice:29.99,price:29.99,image:"assets/products/21500.webp",inStock:true},
    {id:19548,category:"audio",brand:"soundcore",name:"Select 4 Go",sku:"",oldPrice:29.99,price:29.99,image:"assets/products/19548.webp",inStock:true},
    {id:13179,category:"audio",brand:"soundcore",name:"Pyro Mini",sku:"A31A0011",oldPrice:24.99,price:24.99,image:"assets/products/13179.webp",inStock:true},
    // security
    {id:31290,category:"security",brand:"eufy",name:"S3 Max Video Smart Lock",sku:"E85V0TY1",oldPrice:399.99,price:399.99,image:"assets/products/31290.webp",inStock:true},
    {id:26785,category:"security",brand:"eufy",name:"Network Video Recorder S4 for Home Security Cameras",sku:"T8N00341",oldPrice:399.99,price:399.99,image:"assets/products/26785.webp",inStock:true},
    {id:26877,category:"security",brand:"eufy",name:"eufyCam E40 2-Cam Kit (HomeBase S380 and Solar Panel)",sku:"E8144323",oldPrice:399.99,price:399.99,image:"assets/products/26877.webp",inStock:true},
    {id:33590,category:"security",brand:"eufy",name:"eufyCam S4",sku:"T81723W1",oldPrice:349.99,price:349.99,image:"assets/products/33590.webp",inStock:true},
    {id:15866,category:"security",brand:"eufy",name:"E330 Video Smart Lock 2K",sku:"T85311Y1",oldPrice:299.99,price:299.99,image:"assets/products/15866.webp",inStock:true},
    {id:26828,category:"security",brand:"eufy",name:"PoE Bullet-PTZ Cam S4",sku:"T8E00321",oldPrice:279.99,price:279.99,image:"assets/products/26828.webp",inStock:true},
    {id:6631,category:"security",brand:"eufy",name:"S230 Smart Lock Touch & Wi-Fi",sku:"T8510013",oldPrice:259.99,price:259.99,image:"assets/products/6631.webp",inStock:true},
    {id:21686,category:"security",brand:"eufy",name:"E21 Baby Monitor 4K UHD",sku:"E8354321",oldPrice:249.99,price:249.99,image:"assets/products/21686.webp",inStock:true},
    {id:21665,category:"security",brand:"eufy",name:"eufyCam S3 Pro 4K",sku:"",oldPrice:219.99,price:219.99,image:"assets/products/21665.webp",inStock:true},
    {id:7755,category:"security",brand:"eufy",name:"S380 HomeBase 3",sku:"T80303D1",oldPrice:199.99,price:199.99,image:"assets/products/7755.webp",inStock:true},
    {id:15897,category:"security",brand:"eufy",name:"E340 Video Doorbell 2K with Chime",sku:"",oldPrice:179.99,price:179.99,image:"assets/products/15897.webp",inStock:true},
    {id:11459,category:"security",brand:"eufy",name:"S330 eufyCam 3 4K",sku:"",oldPrice:219.99,price:179.99,image:"assets/products/11459.webp",inStock:true},
    {id:31268,category:"security",brand:"eufy",name:"Baby Monitor C10",sku:"E6310321",oldPrice:149.99,price:149.99,image:"assets/products/31268.webp",inStock:false},
    {id:21640,category:"security",brand:"eufy",name:"E30 SoloCam 2K",sku:"T8171321",oldPrice:149.99,price:149.99,image:"assets/products/21640.webp",inStock:false},
    {id:6919,category:"security",brand:"eufy",name:"S230 SoloCam 2K (S40)",sku:"T81243W1",oldPrice:199.99,price:139.99,image:"assets/products/6919.webp",inStock:true},
    {id:26804,category:"security",brand:"eufy",name:"Turret PoE Cam E41",sku:"T8P10321",oldPrice:129.99,price:129.99,image:"assets/products/26804.webp",inStock:true},
    {id:26863,category:"security",brand:"eufy",name:"Bullet PoE Cam E40",sku:"T8P00321",oldPrice:129.99,price:129.99,image:"assets/products/26863.webp",inStock:true},
    {id:12197,category:"security",brand:"eufy",name:"S350 Indoor Cam 4K",sku:"T8416221",oldPrice:129.99,price:129.99,image:"assets/products/12197.webp",inStock:true},
    {id:33648,category:"security",brand:"eufy",name:"eufyCam C37",sku:"",oldPrice:99.99,price:99.99,image:"assets/products/33648.webp",inStock:true},
    {id:13073,category:"security",brand:"eufy",name:"S220 SoloCam 2K",sku:"T8134321",oldPrice:129.99,price:99.99,image:"assets/products/13073.webp",inStock:false},
    {id:33622,category:"security",brand:"eufy",name:"eufyCam C35",sku:"",oldPrice:89.99,price:89.99,image:"assets/products/33622.webp",inStock:true},
    {id:21591,category:"security",brand:"eufy",name:"C30 Video Doorbell 2K FHD",sku:"T8224311",oldPrice:89.99,price:89.99,image:"assets/products/21591.webp",inStock:true},
    {id:21606,category:"security",brand:"eufy",name:"E30 Indoor Cam 4K UHD",sku:"T8417321",oldPrice:79.99,price:79.99,image:"assets/products/21606.webp",inStock:true},
    {id:33567,category:"security",brand:"eufy",name:"Wired Cam C31",sku:"T817L420",oldPrice:59.99,price:59.99,image:"assets/products/33567.webp",inStock:true},
    {id:16102,category:"security",brand:"eufy",name:"C220 Indoor Cam 2K",sku:"T8W11321",oldPrice:39.99,price:39.99,image:"assets/products/16102.webp",inStock:true},
    {id:4084,category:"security",brand:"eufy",name:"Entry Sensor",sku:"T89000D4",oldPrice:29.99,price:29.99,image:"assets/products/4084.webp",inStock:true},
    {id:4083,category:"security",brand:"eufy",name:"Motion Sensor",sku:"T8910021",oldPrice:29.99,price:29.99,image:"assets/products/4083.webp",inStock:true},
    // smart-home
    {id:33829,category:"smart-home",brand:"eufy",name:"eufyMake E1: the First Personal 3D-Texture UV Printer (No Ink Included)",sku:"V8260G40",oldPrice:2999.99,price:2999.99,image:"assets/products/33829.webp",inStock:true},
    {id:19741,category:"smart-home",brand:"eufy",name:"Robot Vacuum Omni S1 Pro",sku:"T2080GA1",oldPrice:1499.99,price:1499.99,image:"assets/products/19741.webp",inStock:false},
    {id:25342,category:"smart-home",brand:"eufy",name:"Robot Vacuum Omni E28",sku:"T2352V11",oldPrice:1399.99,price:1099.99,image:"assets/products/25342.webp",inStock:true},
    {id:26896,category:"smart-home",brand:"eufy",name:"Robot Vacuum Omni E25",sku:"T2353G11",oldPrice:1249.99,price:999.99,image:"assets/products/26896.webp",inStock:true},
    {id:33842,category:"smart-home",brand:"eufy",name:"Robot Vacuum Omni C28",sku:"T211A310",oldPrice:799.99,price:719.99,image:"assets/products/33842.webp",inStock:true},
    {id:33823,category:"smart-home",brand:"eufy",name:"eufyMake Rotary Printing Attachment for UV Printer E1",sku:"V7220010",oldPrice:399.99,price:399.99,image:"assets/products/33823.webp",inStock:true},
    {id:33817,category:"smart-home",brand:"eufy",name:"eufyMake UV DTF Laminating Machine for UV Printer E1",sku:"V8270312",oldPrice:399.99,price:399.99,image:"assets/products/33817.webp",inStock:true},
    {id:25313,category:"smart-home",brand:"eufy",name:"Wearable Breast Pump S1 Pro",sku:"T8D04321",oldPrice:349.99,price:349.99,image:"assets/products/25313.webp",inStock:true},
    {id:36660,category:"smart-home",brand:"eufy",name:"eufyMake Ink and Cleaning Cartridge Kit for UV Printer E1",sku:"V7240010",oldPrice:299.99,price:299.99,image:"assets/products/36660.webp",inStock:true},
    {id:35197,category:"smart-home",brand:"eufy",name:"Wearable Breast Pump E20",sku:"T6060321",oldPrice:199.99,price:199.99,image:"assets/products/35197.webp",inStock:true},
    {id:23539,category:"smart-home",brand:"eufy",name:"Smart Scale C20",sku:"T9130011",oldPrice:59.99,price:59.99,image:"assets/products/23539.webp",inStock:true},
    {id:33753,category:"smart-home",brand:"eufy",name:"eufyMake UV Ink Cartridge for UV Printer E1",sku:"",oldPrice:42.99,price:42.99,image:"assets/products/33753.webp",inStock:true},
    {id:33751,category:"smart-home",brand:"eufy",name:"eufyMake Cleaning Cartridge for UV Printer E1",sku:"V72B0010",oldPrice:42.99,price:42.99,image:"assets/products/33751.webp",inStock:true},
    {id:27246,category:"smart-home",brand:"eufy",name:"eufy Roller Mop For S/E Series",sku:"T2080GA1-E",oldPrice:34.99,price:34.99,image:"assets/products/27246.webp",inStock:false},
    {id:24632,category:"smart-home",brand:"eufy",name:"Hard Floor Cleaning Solution For S1/E25 Series",sku:"T29C1001",oldPrice:32.99,price:32.99,image:"assets/products/24632.webp",inStock:true},
    {id:23523,category:"smart-home",brand:"eufy",name:"Smart Scale A1",sku:"T9120K11",oldPrice:29.99,price:29.99,image:"assets/products/23523.webp",inStock:true},
    {id:9165,category:"smart-home",brand:"eufy",name:"Hard Floor Cleaning Solution (2 Bottles)",sku:"T29C3121",oldPrice:25.99,price:25.99,image:"assets/products/9165.webp",inStock:true},
    {id:4092,category:"smart-home",brand:"eufy",name:"Lumi Stick-On Night Light (3-pack)",sku:"T1301H21",oldPrice:25.99,price:25.99,image:"assets/products/4092.webp",inStock:true},
    {id:27229,category:"smart-home",brand:"eufy",name:"eufy Mop Pads for X8 Hybrid",sku:"T2261311-C",oldPrice:19.99,price:19.99,image:"assets/products/27229.webp",inStock:true},
    {id:27237,category:"smart-home",brand:"eufy",name:"eufy Mop Pads for Omni C20",sku:"T2280V11-4",oldPrice:13.99,price:13.99,image:"assets/products/27237.webp",inStock:true},
    {id:27232,category:"smart-home",brand:"eufy",name:"eufy Mop Pads for X8 Pro",sku:"T2266V11-2",oldPrice:7.99,price:7.99,image:"assets/products/27232.webp",inStock:true},
    {id:27219,category:"smart-home",brand:"eufy",name:"eufy Mop Pads for L60 Hybrid",sku:"T2268G11-A",oldPrice:7.99,price:7.99,image:"assets/products/27219.webp",inStock:true},
    // projector
    {id:24845,category:"projector",brand:"Nebula",name:"X1 | 4K Triple Laser Projector with Micro Gimbal",sku:"D23512F1",oldPrice:2999.99,price:2999.99,image:"assets/products/24845.webp",inStock:true},
    {id:19805,category:"projector",brand:"Nebula",name:"Cosmos 4K SE | The 4K Smart Projector With Dolby Vision",sku:"D2342211",oldPrice:1499.99,price:1499.99,image:"assets/products/19805.webp",inStock:true},
    {id:21466,category:"projector",brand:"Nebula",name:"Capsule Air | The World’s Smallest Google TV Projector",sku:"D4112211",oldPrice:499.99,price:499.99,image:"assets/products/21466.webp",inStock:true},
    {id:21448,category:"projector",brand:"Nebula",name:"Portable Projector Stand",sku:"D0702111",oldPrice:79.99,price:79.99,image:"assets/products/21448.webp",inStock:true},
    {id:21435,category:"projector",brand:"Nebula",name:"Capsule Gimbal Stand",sku:"D0719111",oldPrice:49.99,price:49.99,image:"assets/products/21435.webp",inStock:true},
    {id:19055,category:"projector",brand:"Nebula",name:"Adjustable Tripod for Capsule",sku:"D0711111",oldPrice:49.99,price:49.99,image:"assets/products/19055.webp",inStock:true},
    {id:35223,category:"projector",brand:"soundcore",name:"P1i",sku:"D2200211",oldPrice:449.99,price:449.99,image:"assets/products/35223.webp",inStock:true},
    // solar
    {id:9188,category:"solar",brand:"Anker",name:"21W Dual-Port PowerPort Solar",sku:"A2421011",oldPrice:99.99,price:84.99,image:"assets/products/9188.webp",inStock:true},
    {id:19675,category:"solar",brand:"Anker SOLIX",name:"SOLIX F3800 Portable Power Station – 3840Wh | 6000W",sku:"",oldPrice:2499.99,price:2499.99,image:"assets/products/19675.webp",inStock:true},
    {id:19661,category:"solar",brand:"Anker SOLIX",name:"SOLIX BP3800 Expansion Battery – 3840Wh LFP (For F3800)",sku:"A1790111-85",oldPrice:2499.99,price:2499.99,image:"assets/products/19661.webp",inStock:true},
    {id:33706,category:"solar",brand:"Anker SOLIX",name:"SOLIX C2000 Gen 2 Portable Power Station",sku:"A17833A1",oldPrice:1799.99,price:1399.99,image:"assets/products/33706.webp",inStock:true},
    {id:33688,category:"solar",brand:"Anker SOLIX",name:"SOLIX C1000 Gen 2 Portable Power Station – 1,024Wh | 2,000W",sku:"A17633A1",oldPrice:999.99,price:799.99,image:"assets/products/33688.webp",inStock:true},
    {id:19633,category:"solar",brand:"Anker SOLIX",name:"SOLIX C300X Portable Power Station – 288Wh | 300W",sku:"A17223Z1",oldPrice:329.99,price:329.99,image:"assets/products/19633.webp",inStock:true},
    {id:23366,category:"solar",brand:"Anker SOLIX",name:"SOLIX PS100 Portable Solar Panel",sku:"A24340A1",oldPrice:299.99,price:299.99,image:"assets/products/23366.webp",inStock:true},
    {id:23430,category:"solar",brand:"Anker SOLIX",name:"SOLIX C200 DC Portable Power Station – 192Wh | 200W",sku:"A17270Z1",oldPrice:169.99,price:169.99,image:"assets/products/23430.webp",inStock:true},
    {id:36433,category:"solar",brand:"Anker SOLIX",name:"SOLIX PS60 Portable Solar Panel",sku:"A24383A1-1",oldPrice:149.99,price:149.99,image:"assets/products/36433.webp",inStock:true},
    {id:13705,category:"solar",brand:"eufy",name:"S120 Solar Wall Light Cam 2K",sku:"T81A0311",oldPrice:109.99,price:109.99,image:"assets/products/13705.webp",inStock:true},
    {id:5614,category:"solar",brand:"eufy",name:"eufyCam Solar Panel Charger",sku:"",oldPrice:59.99,price:44.99,image:"assets/products/5614.webp",inStock:true},
    // phone-cases
    {id:21455,category:"phone-cases",brand:"Nebula",name:"Capsule 3 Travel Case",sku:"D0718112",oldPrice:49.99,price:49.99,image:"assets/products/21455.webp",inStock:true},
    {id:19864,category:"phone-cases",brand:"Nebula",name:"Capsule Air Travel Case",sku:"D0732111",oldPrice:39.99,price:39.99,image:"assets/products/19864.webp",inStock:true},
    {id:36981,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Summa Case (Sunset)",sku:"KI1802SP",oldPrice:79.99,price:79.99,image:"assets/products/36981.webp",inStock:true},
    {id:36969,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Summa Case (600D Black/Grey-Twill)",sku:"KI1801SP",oldPrice:79.99,price:79.99,image:"assets/products/36969.webp",inStock:true},
    {id:36995,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Max Summa Case (Sunset)",sku:"KI1802SPM",oldPrice:79.99,price:79.99,image:"assets/products/36995.webp",inStock:true},
    {id:36993,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Max Summa Case (600D Black/Grey-Twill)",sku:"KI1801SPM",oldPrice:79.99,price:79.99,image:"assets/products/36993.webp",inStock:true},
    {id:29183,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Summa Case (600D Black/Grey-Twill)",sku:"KI1701PB",oldPrice:79.99,price:79.99,image:"assets/products/29183.webp",inStock:true},
    {id:29210,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Summa Case (Sunset)",sku:"KI1702BPM",oldPrice:79.99,price:79.99,image:"assets/products/29210.webp",inStock:true},
    {id:29209,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Summa Case (600D Black/Grey-Twill)",sku:"KI1701PBM",oldPrice:79.99,price:79.99,image:"assets/products/29209.webp",inStock:true},
    {id:29196,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Summa Case (Sunset)",sku:"KI1702BP",oldPrice:79.99,price:79.99,image:"assets/products/29196.webp",inStock:true},
    {id:27575,category:"phone-cases",brand:"PITAKA",name:"PITAKA Apple Watch Carbon Fiber Watch Band (Modern)",sku:"AWB2307",oldPrice:79.99,price:79.99,image:"assets/products/27575.webp",inStock:true},
    {id:35876,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy Z Fold 8 Ultra Edge Case (Moonrise)",sku:"FMFOLD8",oldPrice:69.99,price:69.99,image:"assets/products/35876.webp",inStock:true},
    {id:35861,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy Z Fold 8 Ultra Edge Case (California Dream-01)",sku:"FSFOLD8",oldPrice:69.99,price:69.99,image:"assets/products/35861.webp",inStock:true},
    {id:35850,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy Z Fold 8 Ultra Edge Case (600D Black Grey-Twill)",sku:"FBFOLD8",oldPrice:69.99,price:69.99,image:"assets/products/35850.webp",inStock:true},
    {id:35838,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy Z Fold 8 Edge Case (Moonrise)",sku:"FMWFOLD8",oldPrice:69.99,price:69.99,image:"assets/products/35838.webp",inStock:true},
    {id:35826,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy Z Fold 8 Edge Case (California Dream-01)",sku:"FSWFOLD8",oldPrice:69.99,price:69.99,image:"assets/products/35826.webp",inStock:true},
    {id:35813,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy Z Fold 8 Edge Case (600D Black Grey-Twill)",sku:"FBWFOLD8",oldPrice:69.99,price:69.99,image:"assets/products/35813.webp",inStock:true},
    {id:35812,category:"phone-cases",brand:"PITAKA",name:"PITAKA Google Pixel 11 ProXL Edge Case (600D Black/Grey-Twill) (Aaron Button)",sku:"GPB2601",oldPrice:69.99,price:69.99,image:"assets/products/35812.webp",inStock:true},
    {id:35800,category:"phone-cases",brand:"PITAKA",name:"PITAKA Google Pixel 11 Pro Edge Case (600D Black/Grey-Twill) (Aaron Button)",sku:"GPB2604P",oldPrice:69.99,price:69.99,image:"assets/products/35800.webp",inStock:true},
    {id:35887,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy S25 Ultra Cairn Case (600D Black/Grey-Twill)",sku:"PBS2501U",oldPrice:69.99,price:69.99,image:"assets/products/35887.webp",inStock:true},
    {id:33395,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case (Indigo)",sku:"HR1702PM",oldPrice:69.99,price:69.99,image:"assets/products/33395.webp",inStock:true},
    {id:33394,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case (Amber)",sku:"HR1701PM",oldPrice:69.99,price:69.99,image:"assets/products/33394.webp",inStock:true},
    {id:33380,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Edge Case (Indigo)",sku:"HR1702P",oldPrice:69.99,price:69.99,image:"assets/products/33380.webp",inStock:true},
    {id:33363,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Edge Case (Amber)",sku:"HR1701P",oldPrice:69.99,price:69.99,image:"assets/products/33363.webp",inStock:true},
    {id:33320,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case (Harvard Crimson)",sku:"PH1701PM",oldPrice:69.99,price:69.99,image:"assets/products/33320.webp",inStock:true},
    {id:33303,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Edge Case (Harvard Crimson)",sku:"PH1701P",oldPrice:69.99,price:69.99,image:"assets/products/33303.webp",inStock:true},
    {id:33270,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy S26 Ultra Cairn Case (600D Black/Grey-Twill) (Aaron Button)",sku:"PBS2601U",oldPrice:69.99,price:69.99,image:"assets/products/33270.webp",inStock:true},
    {id:31502,category:"phone-cases",brand:"PITAKA",name:"PITAKA Aramid Fiber Magnetic Power Bank (Moonrise)",sku:"PBQ2403",oldPrice:69.99,price:69.99,image:"assets/products/31502.webp",inStock:true},
    {id:31496,category:"phone-cases",brand:"PITAKA",name:"PITAKA Aramid Fiber Magnetic Power Bank (Sunset)",sku:"PBQ2402",oldPrice:69.99,price:69.99,image:"assets/products/31496.webp",inStock:true},
    {id:31483,category:"phone-cases",brand:"PITAKA",name:"PITAKA Aramid Fiber Magnetic Power Bank (Black/Grey-Twill)",sku:"PBQ2401",oldPrice:69.99,price:69.99,image:"assets/products/31483.webp",inStock:true},
    {id:36951,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Cairn Case (Midnight)",sku:"KI1803CP2",oldPrice:59.99,price:59.99,image:"assets/products/36951.webp",inStock:true},
    {id:36935,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Cairn Case (California Dream-01)",sku:"KI1804CP2",oldPrice:59.99,price:59.99,image:"assets/products/36935.webp",inStock:true},
    {id:36920,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Cairn Case (Sunset)",sku:"KI1802CP2",oldPrice:59.99,price:59.99,image:"assets/products/36920.webp",inStock:true},
    {id:36906,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Cairn Case (600D Black/Grey-Twill)",sku:"KI1801CP2",oldPrice:59.99,price:59.99,image:"assets/products/36906.webp",inStock:true},
    {id:36886,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Edge Case (Midnight)",sku:"KI1803P",oldPrice:59.99,price:59.99,image:"assets/products/36886.webp",inStock:true},
    {id:36869,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Edge Case (California Dream-01)",sku:"KI1806P",oldPrice:59.99,price:59.99,image:"assets/products/36869.webp",inStock:true},
    {id:36855,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Edge Case (Sunset)",sku:"KI1802P",oldPrice:59.99,price:59.99,image:"assets/products/36855.webp",inStock:true},
    {id:36833,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Edge Case (600D Black/Grey-Twill)",sku:"KI1801P",oldPrice:59.99,price:59.99,image:"assets/products/36833.webp",inStock:true},
    {id:36967,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Max Cairn Case (Midnight)",sku:"KI1803CPM2",oldPrice:59.99,price:59.99,image:"assets/products/36967.webp",inStock:true},
    {id:36966,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Max Cairn Case (California Dream-01)",sku:"KI1804CPM2",oldPrice:59.99,price:59.99,image:"assets/products/36966.webp",inStock:true},
    {id:36965,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Max Cairn Case (Sunset)",sku:"KI1802CPM2",oldPrice:59.99,price:59.99,image:"assets/products/36965.webp",inStock:true},
    {id:36964,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Max Cairn Case (600D Black/Grey-Twill)",sku:"KI1801CPM2",oldPrice:59.99,price:59.99,image:"assets/products/36964.webp",inStock:true},
    {id:36905,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Max Edge Case (Midnight)",sku:"KI1803PM",oldPrice:59.99,price:59.99,image:"assets/products/36905.webp",inStock:true},
    {id:36904,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Max Edge Case (California Dream-01)",sku:"KI1806PM",oldPrice:59.99,price:59.99,image:"assets/products/36904.webp",inStock:true},
    {id:36903,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Max Edge Case (Sunset)",sku:"KI1802PM",oldPrice:59.99,price:59.99,image:"assets/products/36903.webp",inStock:true},
    {id:36902,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 18 Pro Max Edge Case (600D Black/Grey-Twill)",sku:"KI1801PM",oldPrice:59.99,price:59.99,image:"assets/products/36902.webp",inStock:true},
    {id:33360,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case(California Dream-03)",sku:"SCD1703PM",oldPrice:59.99,price:59.99,image:"assets/products/33360.webp",inStock:true},
    {id:33358,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case(California Dream-01)",sku:"SCD1701PM",oldPrice:59.99,price:59.99,image:"assets/products/33358.webp",inStock:true},
    {id:33342,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Edge Case(California Dream-03)",sku:"SCD1703P",oldPrice:59.99,price:59.99,image:"assets/products/33342.webp",inStock:true},
    {id:33327,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Edge Case(California Dream-01)",sku:"SCD1701P",oldPrice:59.99,price:59.99,image:"assets/products/33327.webp",inStock:true},
    {id:33299,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case (PTK Leaping-Orange Black)",sku:"KI1704PTKP",oldPrice:59.99,price:59.99,image:"assets/products/33299.webp",inStock:true},
    {id:33286,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Edge Case (PTK Leaping-Orange Black)",sku:"KI1704PTK",oldPrice:59.99,price:59.99,image:"assets/products/33286.webp",inStock:true},
    {id:33254,category:"phone-cases",brand:"PITAKA",name:"PITAKA MagEZ Car Mount Pro 2 (Qi2)",sku:"CM2402N",oldPrice:59.99,price:59.99,image:"assets/products/33254.webp",inStock:true},
    {id:31519,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy S26 Ultra Edge Case (Milky Way Galaxy) (Aaron Button)",sku:"KS2605U",oldPrice:59.99,price:59.99,image:"assets/products/31519.webp",inStock:true},
    {id:31508,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy S26 Ultra Edge Case (Over The Horizon)(Aaron Button)",sku:"KS2604U",oldPrice:59.99,price:59.99,image:"assets/products/31508.webp",inStock:true},
    {id:31552,category:"phone-cases",brand:"PITAKA",name:"PITAKA Airpods Pro 3 Aramid Fiber Case (Lucid Blue)",sku:"APM2505",oldPrice:59.99,price:59.99,image:"assets/products/31552.webp",inStock:true},
    {id:31543,category:"phone-cases",brand:"PITAKA",name:"PITAKA Airpods Pro 3 Aramid Fiber Case (Golden Glint)",sku:"APM2504",oldPrice:59.99,price:59.99,image:"assets/products/31543.webp",inStock:true},
    {id:30682,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy S26 Ultra Edge Case (Moonrise)(Aaron Button)",sku:"KS2602U",oldPrice:59.99,price:59.99,image:"assets/products/30682.webp",inStock:true},
    {id:30670,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy S26 Ultra Edge Case (Sunset)(Aaron Button)",sku:"KS2603U",oldPrice:59.99,price:59.99,image:"assets/products/30670.webp",inStock:true},
    {id:30658,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy S26 Ultra Edge Case (600D Black/Grey-Twill)(Aaron Button)",sku:"KS2601U",oldPrice:59.99,price:59.99,image:"assets/products/30658.webp",inStock:true},
    {id:30694,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case (1500D Black/Blue-Twill)",sku:"KI1706BPM",oldPrice:59.99,price:59.99,image:"assets/products/30694.webp",inStock:true},
    {id:30572,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case (PTK Leaping – Gold Green)",sku:"KI1701PTKP",oldPrice:59.99,price:59.99,image:"assets/products/30572.webp",inStock:true},
    {id:30562,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case (PTK Leaping – Gold Red)",sku:"KI1702PTKP",oldPrice:59.99,price:59.99,image:"assets/products/30562.webp",inStock:true},
    {id:30551,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case (Lucid Blue)",sku:"KI1708AG",oldPrice:59.99,price:59.99,image:"assets/products/30551.webp",inStock:true},
    {id:30538,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case (Golden Glint)",sku:"KI1707AG",oldPrice:59.99,price:59.99,image:"assets/products/30538.webp",inStock:true},
    {id:30514,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case (Milky Way Galaxy)",sku:"KI1701MPM",oldPrice:59.99,price:59.99,image:"assets/products/30514.webp",inStock:true},
    {id:30503,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Edge Case (PTK Leaping – Gold Green)",sku:"KI1701PTK",oldPrice:59.99,price:59.99,image:"assets/products/30503.webp",inStock:true},
    {id:30493,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Edge Case (PTK Leaping – Gold Red)",sku:"KI1702PTK",oldPrice:59.99,price:59.99,image:"assets/products/30493.webp",inStock:true},
    {id:30481,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Edge Case (Lucid Blue)",sku:"KI1706AG",oldPrice:59.99,price:59.99,image:"assets/products/30481.webp",inStock:true},
    {id:30456,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Edge Case (Golden Glint)",sku:"KI1705AG",oldPrice:59.99,price:59.99,image:"assets/products/30456.webp",inStock:true},
    {id:30443,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Edge Case (Milky Way Galaxy)",sku:"KI1705MP",oldPrice:59.99,price:59.99,image:"assets/products/30443.webp",inStock:true},
    {id:30419,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone Air Edge Case (Lucid Blue)",sku:"KI1704AG",oldPrice:59.99,price:59.99,image:"assets/products/30419.webp",inStock:true},
    {id:30410,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone Air Edge Case (Golden Glint)",sku:"KI1703AG",oldPrice:59.99,price:59.99,image:"assets/products/30410.webp",inStock:true},
    {id:29173,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy S25 Ultra Edge Case (Over The Horizon)",sku:"KS2504U",oldPrice:59.99,price:59.99,image:"assets/products/29173.webp",inStock:false},
    {id:29163,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Edge Case (600D Black/Grey-Twill)",sku:"KI1701",oldPrice:59.99,price:59.99,image:"assets/products/29163.webp",inStock:true},
    {id:29125,category:"phone-cases",brand:"PITAKA",name:"PITAKA Airpods Pro 3 Aramid Fiber Case (Moonrise)",sku:"APM2503",oldPrice:59.99,price:59.99,image:"assets/products/29125.webp",inStock:true},
    {id:29099,category:"phone-cases",brand:"PITAKA",name:"PITAKA Airpods Pro 3 Aramid Fiber Case (Sunset)",sku:"APM2502",oldPrice:59.99,price:59.99,image:"assets/products/29099.webp",inStock:true},
    {id:29087,category:"phone-cases",brand:"PITAKA",name:"PITAKA Airpods Pro 3 Aramid Fiber Case (1500D Black/Grey-Plain)",sku:"APM2501",oldPrice:59.99,price:59.99,image:"assets/products/29087.webp",inStock:true},
    {id:27872,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Cairn Case (Moonrise)",sku:"KI1703MGPM",oldPrice:59.99,price:59.99,image:"assets/products/27872.webp",inStock:true},
    {id:27861,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Cairn Case (Sunset)",sku:"KI1702MGPM",oldPrice:59.99,price:59.99,image:"assets/products/27861.webp",inStock:true},
    {id:27849,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Cairn Case (600D Black/Grey-Twill)",sku:"KI1701MGPM",oldPrice:59.99,price:59.99,image:"assets/products/27849.webp",inStock:true},
    {id:27836,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Max Edge Case (Over The Horizon)",sku:"KI1704OPM",oldPrice:59.99,price:59.99,image:"assets/products/27836.webp",inStock:true},
    {id:27825,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Cairn Case (Moonrise)",sku:"KI1703MGP",oldPrice:59.99,price:59.99,image:"assets/products/27825.webp",inStock:true},
    {id:27807,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Cairn Case (Sunset)",sku:"KI1702MGP",oldPrice:59.99,price:59.99,image:"assets/products/27807.webp",inStock:true},
    {id:27796,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Cairn Case (600D Black/Grey-Twill)",sku:"KI1701MGP",oldPrice:59.99,price:59.99,image:"assets/products/27796.webp",inStock:true},
    {id:27784,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 17 Pro Edge Case (Over The Horizon)",sku:"KI1704OP",oldPrice:59.99,price:59.99,image:"assets/products/27784.webp",inStock:false},
    {id:27732,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy S25 Ultra Edge Case (Moonrise)",sku:"KS2502U",oldPrice:59.99,price:59.99,image:"assets/products/27732.webp",inStock:true},
    {id:27722,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy S25 Ultra Edge Case (Sunset)",sku:"KS2503U",oldPrice:59.99,price:59.99,image:"assets/products/27722.webp",inStock:true},
    {id:27709,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy S25 Ultra Edge Case (600D Black/Grey-Twill)",sku:"KS2501U",oldPrice:59.99,price:59.99,image:"assets/products/27709.webp",inStock:true},
    {id:27698,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 16 Pro Max Edge Case (Moonrise)",sku:"KI1601MOM",oldPrice:59.99,price:59.99,image:"assets/products/27698.webp",inStock:true},
    {id:27685,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 16 Pro Max Edge Case (Sunset)",sku:"KI1602SUM",oldPrice:59.99,price:59.99,image:"assets/products/27685.webp",inStock:true},
    {id:27674,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 16 Pro Max Edge Case (600D Black/Grey-Twill)",sku:"KI1602PAM",oldPrice:59.99,price:59.99,image:"assets/products/27674.webp",inStock:true},
    {id:27643,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 16 Pro Edge Case (Moonrise)",sku:"KI1601MO",oldPrice:59.99,price:59.99,image:"assets/products/27643.webp",inStock:true},
    {id:27630,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 16 Pro Edge Case (Sunset)",sku:"KI1602SU",oldPrice:59.99,price:59.99,image:"assets/products/27630.webp",inStock:true},
    {id:27619,category:"phone-cases",brand:"PITAKA",name:"PITAKA Iphone 16 Pro Edge Case (600D Black/Grey-Twill)",sku:"KI1601PA",oldPrice:59.99,price:59.99,image:"assets/products/27619.webp",inStock:true},
    {id:27605,category:"phone-cases",brand:"PITAKA",name:"PITAKA AirPods Pro 2 Aramid Fiber Case (Moonrise)",sku:"APM2403",oldPrice:59.99,price:59.99,image:"assets/products/27605.webp",inStock:true},
    {id:27598,category:"phone-cases",brand:"PITAKA",name:"PITAKA AirPods Pro 2 Aramid Fiber Case (Sunset)",sku:"APM2402",oldPrice:59.99,price:59.99,image:"assets/products/27598.webp",inStock:true},
    {id:27586,category:"phone-cases",brand:"PITAKA",name:"PITAKA AirPods Pro 2 Aramid Fiber Case (1500D Black/Grey-Plain)",sku:"APM2401",oldPrice:59.99,price:59.99,image:"assets/products/27586.webp",inStock:true},
    {id:26263,category:"phone-cases",brand:"PITAKA",name:"PITAKA iPhone Air Edge (600D Black/Grey-Twill)",sku:"KI1701BA",oldPrice:59.99,price:59.99,image:"assets/products/26263.webp",inStock:false},
    {id:26257,category:"phone-cases",brand:"PITAKA",name:"PITAKA iPhone Air Edge Case (Sunset)",sku:"KI1702SA",oldPrice:59.99,price:59.99,image:"assets/products/26257.webp",inStock:true},
    {id:26251,category:"phone-cases",brand:"PITAKA",name:"PITAKA iPhone Air Edge Case (Moonrise)",sku:"KI1703M",oldPrice:59.99,price:59.99,image:"assets/products/26251.webp",inStock:true},
    {id:26249,category:"phone-cases",brand:"PITAKA",name:"PITAKA iPhone 17 Pro Edge Case (600D Black/Grey-Twill)",sku:"KI1701BP",oldPrice:59.99,price:59.99,image:"assets/products/26249.webp",inStock:false},
    {id:26247,category:"phone-cases",brand:"PITAKA",name:"PITAKA iPhone 17 Pro Edge Case (Sunset)",sku:"KI1702SP",oldPrice:59.99,price:59.99,image:"assets/products/26247.webp",inStock:true},
    {id:26245,category:"phone-cases",brand:"PITAKA",name:"PITAKA iPhone 17 Pro Edge Case (Moonrise)",sku:"KI1703MP",oldPrice:59.99,price:59.99,image:"assets/products/26245.webp",inStock:true},
    {id:26226,category:"phone-cases",brand:"PITAKA",name:"PITAKA iPhone 17 Pro Max Edge Case (600D Black/Grey-Twill)",sku:"KI1701BPM",oldPrice:59.99,price:59.99,image:"assets/products/26226.webp",inStock:true},
    {id:26192,category:"phone-cases",brand:"PITAKA",name:"PITAKA iPhone 17 Pro Max Edge Case(Moonrise)",sku:"KI1703MPM",oldPrice:59.99,price:59.99,image:"assets/products/26192.webp",inStock:false},
    {id:26176,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy Z Fold 7 Edge Case (600D Black/Grey-Twill)",sku:"FBFold7",oldPrice:59.99,price:59.99,image:"assets/products/26176.webp",inStock:true},
    {id:26165,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy Z Fold 7 Edge Case (Moonrise)",sku:"FMFold7",oldPrice:59.99,price:59.99,image:"assets/products/26165.webp",inStock:true},
    {id:26211,category:"phone-cases",brand:"PITAKA",name:"PITAKA iPhone 17 Pro Max Edge Case (Sunset)",sku:"KI1702SPM",oldPrice:59.99,price:59.99,image:"assets/products/26211.webp",inStock:true},
    {id:30400,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy Z Flip 7 Edge Case (Moonrise)",sku:"FMFLIP7",oldPrice:59.99,price:47.99,image:"assets/products/30400.webp",inStock:true},
    {id:30392,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy Z Flip 7 Edge Case (Sunset)",sku:"FSFLIP7",oldPrice:59.99,price:47.99,image:"assets/products/30392.webp",inStock:true},
    {id:30382,category:"phone-cases",brand:"PITAKA",name:"PITAKA Galaxy Z Flip 7 Edge Case (600D Black/Grey-Twill)",sku:"FBFLIP7",oldPrice:59.99,price:47.99,image:"assets/products/30382.webp",inStock:true},
    {id:27766,category:"phone-cases",brand:"PITAKA",name:"PITAKA Google Pixel 10 Pro XL Edge Case (600D Black/Grey-Twill)",sku:"GPB2503",oldPrice:59.99,price:47.99,image:"assets/products/27766.webp",inStock:true},
    {id:27753,category:"phone-cases",brand:"PITAKA",name:"PITAKA Google Pixel 10/10 Pro Edge Case (600D Black/Grey-Twill)",sku:"GPB2501",oldPrice:59.99,price:47.99,image:"assets/products/27753.webp",inStock:false},
    {id:29150,category:"phone-cases",brand:"PITAKA",name:"PITAKA Magnetic Woven Wallet (Black/Grey-Twill)",sku:"MWW2401",oldPrice:39.99,price:39.99,image:"assets/products/29150.webp",inStock:true},
    {id:29136,category:"phone-cases",brand:"PITAKA",name:"PITAKA Magnetic Woven Wallet (Sunset)",sku:"MWW2402",oldPrice:39.99,price:39.99,image:"assets/products/29136.webp",inStock:true},
    {id:27561,category:"phone-cases",brand:"PITAKA",name:"PITAKA Air Case For Apple Watch Ultra Series 49mm (600D Black/Grey-Twill)",sku:"KW3001A",oldPrice:39.99,price:39.99,image:"assets/products/27561.webp",inStock:true},
    {id:26153,category:"phone-cases",brand:"PITAKA",name:"PITAKA Magnetic Woven Wallet (Moonrise)",sku:"MWW2403",oldPrice:39.99,price:39.99,image:"assets/products/26153.webp",inStock:true},
    {id:30374,category:"phone-cases",brand:"PITAKA",name:"PITAKA Grip3 (Lucid Blue)",sku:"MGB2406",oldPrice:24.99,price:24.99,image:"assets/products/30374.webp",inStock:true},
    {id:30363,category:"phone-cases",brand:"PITAKA",name:"PITAKA Grip3 (Golden Glint)",sku:"MGB2405",oldPrice:24.99,price:24.99,image:"assets/products/30363.webp",inStock:true},
    {id:26137,category:"phone-cases",brand:"PITAKA",name:"PITAKA Grip3 (600D Black/Grey-Twill)",sku:"MGB2402",oldPrice:24.99,price:24.99,image:"assets/products/26137.webp",inStock:true},
    {id:26124,category:"phone-cases",brand:"PITAKA",name:"PITAKA Grip3 (Sunset)",sku:"MGS2403",oldPrice:24.99,price:24.99,image:"assets/products/26124.webp",inStock:true},
    {id:26110,category:"phone-cases",brand:"PITAKA",name:"PITAKA Grip3 (Moonrise)",sku:"MGM2404",oldPrice:24.99,price:24.99,image:"assets/products/26110.webp",inStock:true},
    // accessories
    {id:27265,category:"accessories",brand:"Anker",name:"eufy Dust Bags For S Series",sku:"T2080GA1-B",oldPrice:12.99,price:12.99,image:"assets/products/27265.webp",inStock:true},
    {id:4098,category:"accessories",brand:"Anker",name:"AAA Alkaline Batteries (8-pack)",sku:"B1820H13",oldPrice:3.99,price:3.99,image:"assets/products/4098.webp",inStock:true},
    {id:4097,category:"accessories",brand:"Anker",name:"AAA Alkaline Batteries (4-pack)",sku:"B1820H12",oldPrice:1.99,price:1.99,image:"assets/products/4097.webp",inStock:true},
    {id:25286,category:"accessories",brand:"Anker SOLIX",name:"SOLIX EverFrost 2 58L Electric Cooler (61 qt)｜1× 288Wh",sku:"A17A53A1",oldPrice:1199.99,price:1199.99,image:"assets/products/25286.webp",inStock:true},
    {id:35177,category:"accessories",brand:"eufy",name:"Smart Display E10",sku:"T87A0B20",oldPrice:299.99,price:299.99,image:"assets/products/35177.webp",inStock:true},
    {id:23516,category:"accessories",brand:"eufy",name:"S1 Pro replacement battery",sku:"T29J4111",oldPrice:139.99,price:139.99,image:"assets/products/23516.webp",inStock:true},
    {id:23507,category:"accessories",brand:"eufy",name:"RoboVac Battery, Compatible with Omni C20 Robot Vacuum",sku:"T290H110",oldPrice:69.99,price:69.99,image:"assets/products/23507.webp",inStock:true},
    {id:33223,category:"accessories",brand:"eufy",name:"eufy RoboVac Replacement Battery (2 Pieces)",sku:"T29J5012",oldPrice:59.99,price:59.99,image:"assets/products/33223.webp",inStock:true},
    {id:8587,category:"accessories",brand:"eufy",name:"RoboVac Replacement Battery X8 Series",sku:"T2937111",oldPrice:49.99,price:49.99,image:"assets/products/8587.webp",inStock:true},
    {id:32937,category:"accessories",brand:"eufy",name:"eufy Dust Bags For Omni C20 (6 Pieces)",sku:"T290A110",oldPrice:44.99,price:44.99,image:"assets/products/32937.webp",inStock:true},
    {id:28673,category:"accessories",brand:"eufy",name:"eufy Replacement Parts Kit for X10 Pro Omni",sku:"T2351V11-80",oldPrice:35.99,price:35.99,image:"assets/products/28673.webp",inStock:true},
    {id:21580,category:"accessories",brand:"eufy",name:"Replacement Battery L Series",sku:"T29D3111",oldPrice:34.99,price:34.99,image:"assets/products/21580.webp",inStock:true},
    {id:32864,category:"accessories",brand:"eufy",name:"eufy Dust Bag For S Series (3 Pieces)",sku:"T29B9021",oldPrice:29.99,price:29.99,image:"assets/products/32864.webp",inStock:true},
    {id:35744,category:"accessories",brand:"eufy",name:"eufy Rolling Brush For C/E Series",sku:"T290GA10",oldPrice:25.99,price:25.99,image:"assets/products/35744.webp",inStock:true},
    {id:35742,category:"accessories",brand:"eufy",name:"eufy Dust Bags For C/E Series (3 Pieces)",sku:"T29YQA20",oldPrice:24.99,price:24.99,image:"assets/products/35742.webp",inStock:true},
    {id:32856,category:"accessories",brand:"eufy",name:"eufy Side Brushes For S/E Series (2 Pairs)",sku:"T29B8011",oldPrice:19.99,price:19.99,image:"assets/products/32856.webp",inStock:true},
    {id:27274,category:"accessories",brand:"eufy",name:"eufy Roller Brush For X10 Pro Omni",sku:"T235V11-R",oldPrice:16.99,price:16.99,image:"assets/products/27274.webp",inStock:false},
    {id:27282,category:"accessories",brand:"eufy",name:"eufy Roller Brush For Omni C20",sku:"T2280V11-5",oldPrice:16.99,price:16.99,image:"assets/products/27282.webp",inStock:true},
    {id:27454,category:"accessories",brand:"eufy",name:"eufy Brush Guards For Omni C20",sku:"T2280V11-6",oldPrice:15.99,price:15.99,image:"assets/products/27454.webp",inStock:true},
    {id:31435,category:"accessories",brand:"eufy",name:"eufy Dirty Water Reservoir Filter For E Series",sku:"T290JA19",oldPrice:14.99,price:14.99,image:"assets/products/31435.webp",inStock:true},
    {id:31437,category:"accessories",brand:"eufy",name:"eufy Replacement Filter for E Series",sku:"T290KA10",oldPrice:11.99,price:11.99,image:"assets/products/31437.webp",inStock:true},
    {id:27289,category:"accessories",brand:"eufy",name:"eufy Roller Brush For S Series",sku:"T2080GA1-D",oldPrice:11.99,price:11.99,image:"assets/products/27289.webp",inStock:false},
    {id:27338,category:"accessories",brand:"eufy",name:"eufy Filter For S Series",sku:"T2080GA1-C",oldPrice:9.99,price:9.99,image:"assets/products/27338.webp",inStock:false},
    {id:27317,category:"accessories",brand:"eufy",name:"eufy Filters For X9 Pro",sku:"T2320V11-A",oldPrice:9.99,price:9.99,image:"assets/products/27317.webp",inStock:true},
    {id:27369,category:"accessories",brand:"eufy",name:"eufy Side Brushes For S/E Series",sku:"T2080GA1-A",oldPrice:9.99,price:9.99,image:"assets/products/27369.webp",inStock:true},
    {id:27351,category:"accessories",brand:"eufy",name:"eufy Side Brushes For X9 Pro/X10 Pro Omni",sku:"T235V11-S",oldPrice:8.99,price:8.99,image:"assets/products/27351.webp",inStock:true},
    {id:27326,category:"accessories",brand:"eufy",name:"eufy Filters For X10 Pro Omni",sku:"T2351V11-C",oldPrice:8.99,price:8.99,image:"assets/products/27326.webp",inStock:true},
    {id:27251,category:"accessories",brand:"eufy",name:"eufy Dust Bags For X8 Pro/X10 Pro Omni",sku:"T2351V11-B",oldPrice:7.99,price:7.99,image:"assets/products/27251.webp",inStock:true},
    {id:27259,category:"accessories",brand:"eufy",name:"eufy Dust Bags For Omni C20",sku:"T2280V11-1",oldPrice:7.99,price:7.99,image:"assets/products/27259.webp",inStock:true},
    {id:27361,category:"accessories",brand:"eufy",name:"eufy Side Brushes For X8 Hybrid/X8 Pro/Omni C20",sku:"T2280V11-2",oldPrice:5.99,price:5.99,image:"assets/products/27361.webp",inStock:true},
    {id:27331,category:"accessories",brand:"eufy",name:"eufy Filters For Omni C20",sku:"T2280V11-3",oldPrice:4.99,price:4.99,image:"assets/products/27331.webp",inStock:true},
    {id:8044,category:"accessories",brand:"Kingston",name:"Kingston 960GB A400",sku:"SA400S37/960G",oldPrice:209.99,price:209.99,image:"assets/products/8044.webp",inStock:true},
    {id:11115,category:"accessories",brand:"Kingston",name:"Kingston 480GB A400",sku:"SA400S37/480G",oldPrice:139.99,price:139.99,image:"assets/products/11115.webp",inStock:true},
    {id:5489,category:"accessories",brand:"Kingston",name:"Kingston Canvas Select Plus microSD",sku:"",oldPrice:19.99,price:19.99,image:"assets/products/5489.webp",inStock:true}
  ];

  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));
  const categoryIds = new Set(categories.map(c => c.id));
  const t = (key, vars, lang) => (window.I18N ? window.I18N.t(key, vars, lang) : "");
  const known = value => typeof value === "string" && value.indexOf("⟦") !== 0 && value !== "";

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function round2(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  }

  function normalize(p, flags) {
    // savedAt only exists so two devices cannot overwrite each other silently.
    const price = round2(p.price);
    const old = round2(p.oldPrice);
    const oldPrice = old > price ? old : price;
    const discount = oldPrice > price && price > 0 ? Math.min(95, Math.round((1 - price / oldPrice) * 100)) : 0;
    return {
      ...p,
      ...flags,
      id: Number(p.id),
      name: String(p.name || ""),
      brand: String(p.brand || ""),
      category: String(p.category || ""),
      sku: String(p.sku || ""),
      description: String(p.description || ""),
      descriptionAr: String(p.descriptionAr || ""),
      descriptionTr: String(p.descriptionTr || ""),
      details: String(p.details || ""),
      badge: String(p.badge || ""),
      image: String(p.image || ""),
      inStock: p.inStock !== false,
      price,
      oldPrice,
      discount
    };
  }

  // Applies the admin changes saved in Vercel Blob on top of the catalogue.
  // Newest admin-added products come first, then the catalogue order.
  function merge(state) {
    const s = state || {};
    const overrides = s.overrides && typeof s.overrides === "object" && !Array.isArray(s.overrides) ? s.overrides : {};
    const deleted = new Set((Array.isArray(s.deleted) ? s.deleted : []).map(Number));
    const builtIn = new Set(products.map(p => p.id));

    const added = new Map();
    (Array.isArray(s.additions) ? s.additions : []).forEach(p => { if (p && p.id) added.set(Number(p.id), p); });
    // Older admin versions saved edits of added products as overrides; the override is
    // the newer copy. An override for an id we no longer know is dead data, not a product.
    Object.values(overrides).forEach(o => {
      const id = Number(o && o.id);
      if (id && !builtIn.has(id) && added.has(id)) added.set(id, { ...added.get(id), ...o });
    });

    const additions = [...added.values()]
      .filter(p => !deleted.has(Number(p.id)) && p.name)
      .sort((a, b) => Number(b.id) - Number(a.id))
      .map(p => normalize(p, { added: true }));

    const base = products
      .filter(p => !deleted.has(p.id))
      .map(p => {
        const o = overrides[String(p.id)];
        if (!o) return normalize(p);
        const edits = ["name", "nameEn", "nameTr", "description", "descriptionAr", "descriptionTr", "details"]
          .filter(k => o[k] !== undefined && String(o[k]) !== String(p[k] === undefined ? "" : p[k]));
        return normalize({ ...p, ...o, id: p.id }, { edited: true, edits });
      });

    return additions.concat(base);
  }

  // Products hidden from the store (restorable from the admin page).
  function deletedProducts(state) {
    const s = state || {};
    const deleted = new Set((Array.isArray(s.deleted) ? s.deleted : []).map(Number));
    const overrides = s.overrides && typeof s.overrides === "object" ? s.overrides : {};
    const found = new Map();
    products.forEach(p => { if (deleted.has(p.id)) found.set(p.id, { ...p, ...(overrides[String(p.id)] || {}), id: p.id }); });
    (Array.isArray(s.additions) ? s.additions : []).forEach(p => {
      const id = Number(p && p.id);
      if (deleted.has(id)) found.set(id, { ...p, ...(overrides[String(id)] || {}), id });
    });
    return [...found.values()].filter(p => p.name).map(p => normalize(p));
  }

  // A number WhatsApp can actually open: digits only, no leading zeros, 10-15 long.
  function cleanWhatsapp(value) {
    const digits = String(value || "").replace(/\D/g, "").replace(/^0+/, "");
    return digits.length >= 10 && digits.length <= 15 ? digits : "";
  }

  function mergeSettings(state) {
    const saved = (state && state.settings) || {};
    return {
      whatsapp: cleanWhatsapp(saved.whatsapp) || settings.whatsapp,
      email: typeof saved.email === "string" ? saved.email : settings.email
    };
  }

  /* There is no artwork fallback any more, and that is deliberate. The sixteen
     category drawings this used to return had ANKER, soundcore, eufy, NEBULA
     or SOLIX baked into them as SVG text, so a Joyroom product with a missing
     photo advertised a competitor. A product with no photograph now returns
     null and the page renders a department glyph with the product's own brand
     name beside it. */
  function fallbackFor() { return null; }

  // Paths are stored without a leading slash; serve them from the root so they
  // also resolve on /p/<id>.
  function rooted(url) {
    return url && !/^(https?:|data:|\/)/.test(url) ? "/" + url : url;
  }

  // null when the product has no photograph; every caller must handle it.
  function imageFor(p) {
    if (p && typeof p.image === "string" && p.image.trim()) return rooted(p.image.trim());
    const custom = window.PRODUCT_IMAGES && window.PRODUCT_IMAGES[String(p && p.id)];
    if (custom) return rooted(custom);
    return null;
  }

  const ARABIC = /[\u0600-\u06FF]/;

  // Description in the requested language, falling back to the generic category
  // line so no shopper is ever shown another language's text.
  function descFor(p, lang) {
    const own = { ar: p.descriptionAr, en: p.description, tr: p.descriptionTr };
    if (own[lang]) return own[lang];
    // Older admin versions had a single description field, often filled in Arabic.
    if (lang === "ar" && p.description && ARABIC.test(p.description)) return p.description;
    const generic = t("categoryDesc." + p.category, { brand: p.brand || "" }, lang);
    if (known(generic)) return generic;
    return p.description && !ARABIC.test(p.description) ? p.description : "";
  }

  function categoryLabel(id, lang) {
    const value = t("category." + id, null, lang);
    return known(value) ? value : String(id || "");
  }

  function brandTagline(name, lang) {
    const value = t("brandTagline." + name, null, lang);
    return known(value) ? value : "";
  }

  function isKnownCategory(id) { return categoryIds.has(String(id)); }

  window.STORE = {
    categories, brands, products, settings,
    esc, merge, deletedProducts, mergeSettings, imageFor, fallbackFor,
    descFor, categoryLabel, brandTagline, isKnownCategory, cleanWhatsapp
  };
})();
