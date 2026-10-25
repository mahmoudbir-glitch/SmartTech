/*
 * SmartTech — كل نصوص المتجر
 * ============================
 * هذا هو الملف الوحيد الذي يحتوي نصوصاً يقرأها الزبون.
 * لإضافة لغة جديدة: أضفها إلى languages ثم أضف قاموساً لها بنفس المفاتيح.
 * الترجمة هنا تسويقية وليست حرفية: العربية هي الأصل، والإنجليزية والتركية
 * مكتوبتان لسوقيهما لا نقلاً عن العربية.
 *
 * نصوص لوحة التحكم ليست هنا. كتلتا `admin` و`error` انتقلتا إلى
 * i18n-admin.js الذي لا يحمّله إلا admin.html، فتوقّف كل زبون عن تنزيل
 * ٢٢٬٦٩٧ بايتاً من نصوص الإدارة ليقرأ صفحة منتج.
 *
 * Conventions that the rest of the shop depends on:
 *   · A dotted key (`cat.cameras`, `city.sy-aleppo`) is a NESTED object —
 *     `lookup()` walks the dots, so a flat "cat.cameras" would never resolve.
 *   · Plurals come in four shapes — …One, …Two, …Few (3–10), …Many (11+) —
 *     and `SY.plural(base, n)` picks between them. `{n}` arrives already
 *     wrapped in <bdi>, so never write a bare digit beside it.
 *   · Money, counts and percentages arrive as markup from SY.money / SY.num /
 *     SY.percent, already `<bdi dir="ltr">`-isolated. A string may carry
 *     {price} or {n}; it must never carry a currency sign or a digit of its own.
 *   · Never glue an Arabic letter to a Latin token: «وWi-Fi» renders as
 *     «Wi-Fig», because the waw reads as a Latin g. Always a space.
 *   · A missing key renders ⟦key⟧ and the language test fails the build.
 */
(function () {
  const languages = [
    { code: "ar", native: "العربية", dir: "rtl" },
    { code: "en", native: "English", dir: "ltr" },
    { code: "tr", native: "Türkçe", dir: "ltr" }
  ];

  const dict = {
    ar: {
      /* ----------------- الهوية ووسوم الصفحة · identity and page tags */
      brandName: "SmartTech",
      pageTitle: "سمارت تك | منتجات Anker الأصلية جملة ومفرق — أعزاز، حلب",
      metaDescription: "متجر سمارت تك في أعزاز – حلب: شواحن وباور بانك وسماعات من Anker وsoundcore وeufy. جملة ومفرق، والطلب عبر واتساب.",

      /* ------------------------ الرأس والتنقل · header and navigation */
      skipToMain: "الانتقال إلى المحتوى",
      skipToProducts: "الانتقال إلى المحتوى",
      homeTitle: "سمارت تك — منتجات Anker الأصلية 100%",
      navHome: "الصفحة الرئيسية",
      navDepts: "الأقسام",
      navSearch: "بحث",
      navCart: "السلة",
      navWhatsApp: "واتساب",
      navFavourites: "المفضلة",
      navBrowse: "كل الأقسام",
      navBrands: "العلامات التجارية",
      navOffers: "العروض",
      bottomBarLabel: "التنقل السريع",
      languageLabel: "اللغة",
      close: "إغلاق",
      closeLabel: "إغلاق",
      back: "رجوع",
      imagePreview: "معاينة الصورة",

      /* ----------------------------------------------- البحث · search */
      searchLabel: "بحث",
      searchPlaceholder: "ابحث عن منتج أو قسم أو علامة",
      searchClear: "مسح البحث",
      searchSuggest: "اقتراحات البحث",
      searchTitle: "نتائج البحث عن «{q}»",
      searchSimilar: "نتائج مشابهة ({n})",
      searchInDepts: "في الأقسام",
      searchInBrands: "العلامة",

      /* --------------------------------------- الصفحة الرئيسية · home */
      homeDeptsWord: "أقسام",
      homeItemsWord: "منتجاً",
      homeAuthorised: "جملة ومفرق",
      heroBadge: "منتجات Anker أصلية 100%",
      heroTitle: "منتجات Anker الأصلية 100%",
      heroSub: "جملة ومفرق — حلب، أعزاز",
      heroOrder: "اطلب عبر واتساب",
      heroBrowse: "تصفّح المنتجات",
      promoBar: "متوفر الآن — جملة ومفرق",
      navAnker: "Anker",
      navSoundcore: "Soundcore",
      navAccessories: "ملحقات الجوال",
      navWholesale: "الجملة",
      navContact: "تواصل معنا",
      navBrandsLabel: "العلامات التجارية",
      deptsTitle: "الأقسام",
      deptsAllIn: "كل منتجات {name}",
      deptsBrands: "العلامات التجارية",
      railPopular: "الأكثر رواجاً",
      railOffers: "عروض",
      railNew: "وصل حديثاً",
      railAll: "عرض الكل",

      /* ------------------------------ بطاقة المنتج · the product card */
      cardOff: "خصم {n}",
      cardPriceFrom: "يبدأ من {price}",
      cardOut: "غير متوفر حالياً",
      cardColoursOne: "بلون واحد",
      cardColoursTwo: "بلونين",
      cardColoursFew: "بـ{n} ألوان",
      cardColoursMany: "بـ{n} لوناً",
      cardFav: "أضف {name} إلى المفضلة",
      cardUnfav: "أزل {name} من المفضلة",
      cardAdded: "أُضيف",

      /* -------------------------- التصفية والترتيب · filters and sort */
      filterTitle: "تصفية",
      filterClear: "مسح الكل",
      filterShow: "عرض {n} نتيجة",
      filterRemove: "إزالة هذه التصفية",
      filterBrandLegend: "العلامة التجارية",
      filterDeviceLegend: "جهازك",
      filterPriceLegend: "السعر",
      filterPriceFrom: "من",
      filterPriceTo: "إلى",
      filterStockLegend: "التوفر",
      filterInStock: "المتوفر فقط",
      sortLabel: "ترتيب",
      sortRelevance: "الأنسب",
      sortPopular: "الأكثر رواجاً",
      sortCheap: "الأرخص أولاً",
      sortDear: "الأغلى أولاً",
      sortNewest: "الأحدث",
      sortDiscount: "أعلى خصم",

      /* --------------------- عدّ النتائج والصفحات · counts and paging */
      resultRange: "عرض {range} من أصل {total}",
      pagerMore: "عرض {n} منتجاً إضافياً",
      pagerLabel: "صفحات النتائج",
      pagerPrev: "السابق",
      pagerNext: "التالي",
      allTitle: "كل المنتجات",
      favTitle: "المفضلة",
      dealsTitle: "العروض",

      /* ------------------------------- الحالات الفارغة · empty states */
      emptySearchTitle: "لا توجد نتائج لـ «{q}»",
      emptySearchText: "جرّب كلمة أقصر، أو تأكّد من الإملاء.",
      emptySearchAsk: "اسأل عنه على واتساب",
      emptyDidYouMean: "هل تقصد",
      emptyNear: "نتائج قريبة",
      emptyBrowse: "تصفّح الأقسام",
      emptyFavTitle: "لا شيء في المفضلة بعد",
      emptyFavText: "اضغط القلب على أي منتج ليبقى هنا.",
      emptyFavAction: "تصفّح الأكثر رواجاً",
      emptyFilterTitle: "لا نتائج بهذه التصفية",
      emptyFilterText: "جرّب إزالة أحد الشروط لتوسيع النتائج.",
      emptyNodeTitle: "{name} قيد التزويد",
      emptyNodeText: "لا شيء في هذا القسم الآن. تصلنا بضاعة جديدة باستمرار.",
      emptyNodeAsk: "اسأل عن التوفر على واتساب",

      /* --------------------------- العلامات والثقة · brands and trust */
      brandStripTitle: "تسوّق حسب العلامة",
      brandStripAll: "كل العلامات",
      trustTitle: "لماذا سمارت تك",
      trustGenuineTitle: "بضاعة أصلية",
      trustGenuineText: "منتجات Anker وsoundcore وeufy الأصلية، بعلبتها وملحقاتها.",
      trustDeliveryTitle: "توصيل لكل المحافظات",
      trustDeliveryText: "نشحن إلى جميع المحافظات السورية، وتُحدَّد أجرة التوصيل حسب مدينتك قبل الشحن.",
      trustPriceTitle: "سعر واضح قبل الطلب",
      trustPriceText: "السعر المعروض هو السعر، بلا رسوم أو إضافات تظهر لاحقاً.",
      trustDistributor: "سمارت تك متجر في أعزاز – حلب لبيع منتجات Anker وsoundcore وeufy بالجملة والمفرق.",

      /* --------------------------------------------- التذييل · footer */
      footerAbout: "متجر في أعزاز – حلب لمنتجات Anker الأصلية، جملة ومفرق.",
      footerDepts: "الأقسام",
      footerShop: "المتجر",
      footerHelp: "المساعدة",
      footerShipping: "الشحن والتوصيل",
      footerWarranty: "الضمان والإرجاع",
      footerContact: "تواصل معنا",
      footerAdmin: "لوحة تحكم المتجر",
      footerInstall: "ثبّت التطبيق",
      installIosHint: "اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»",
      footerNote: "جميع الأسماء والعلامات التجارية ملك لأصحابها.",
      footerRights: "© {year} سمارت تك",
      footerRightsFallback: "© سمارت تك",

      /* --------- الصفحات المولّدة على الخادم · server-rendered routes */
      routeHome: "الرئيسية",
      routeCrumbLabel: "مسار التنقل",
      routeListLabel: "منتجات {label}",
      routeCountOne: "منتج واحد",
      routeCountTwo: "منتجان",
      routeCountFew: "{n} منتجات",
      routeCountMany: "{n} منتجاً",
      routeBrowse: "كل الأقسام",
      routeBrowseTitle: "كل الأقسام — {count} | {site}",
      routeBrowseDesc: "تصفّح كل أقسام متجر سمارت تك وفئاته في صفحة واحدة: {count} مرتّبة حسب القسم، مع عدد المنتجات في كل فئة.",
      routeBrands: "العلامات التجارية",
      routeBrandsTitle: "العلامات التجارية — {count} | {site}",
      routeBrandsDesc: "كل العلامات التي نوزّعها في سوريا مع عدد المنتجات خلف كل واحدة: {count} أصلية بضمان المصنّع.",
      routeCatHeading: "{label} في سوريا",
      routeCatTitle: "{label} في سوريا — {count} | {site}",
      routeCatDesc: "تسوّق {label}: {count} من {brand} وغيرها، بأسعار من {min} إلى {max}. منتجات أصلية والطلب عبر واتساب.",
      routeBrandHeading: "منتجات {brand} في سوريا",
      routeBrandTitle: "منتجات {brand} في سوريا — {count} | {site}",
      routeBrandDesc: "كل منتجات {brand} الأصلية في سوريا: {count} بأسعار من {min} إلى {max}، بضمان المصنّع وتوصيل لكل المحافظات.",

      /* -------- أسماء الأقسام والفئات · department and category names */
      cat: {
        charging: "الشحن والكابلات",
        "power-banks": "باور بانك",
        "wall-chargers": "شواحن",
        cables: "كابلات",
        "wireless-chargers": "شواحن لاسلكية",
        "car-charging": "شواحن سيارة",
        "solar-chargers": "شواحن شمسية",
        "phone-acc": "إكسسوارات الهاتف",
        cases: "كفرات وأغطية",
        "wallets-grips": "محافظ ومساند",
        "watch-bands": "أساور ساعات",
        "sound-vision": "الصوت والصورة",
        earbuds: "سماعات لاسلكية",
        headphones: "سماعات رأس",
        speakers: "مكبّرات صوت",
        projectors: "أجهزة عرض",
        "av-accessories": "حوامل وملحقات",
        security: "المراقبة والأمان",
        cameras: "كاميرات مراقبة",
        doorbells: "أجراس باب ذكية",
        locks: "أقفال ذكية",
        sensors: "حساسات وإنذار",
        recorders: "أجهزة تسجيل",
        home: "المنزل الذكي",
        vacuums: "مكانس روبوت",
        "health-baby": "مراقبة الأطفال والعناية",
        makers: "طابعات UV",
        "smart-living": "إضاءة وشاشات ذكية",
        energy: "الطاقة الشمسية والكهرباء",
        "power-stations": "محطات طاقة",
        "solar-panels": "ألواح شمسية",
        "off-grid": "أجهزة خارج الشبكة",
        computing: "الكمبيوتر والتخزين",
        "hubs-docks": "موزّعات ومحطات وصل",
        storage: "ذاكرة وتخزين",
        parts: "قطع الغيار",
        "vacuum-parts": "قطع غيار المكانس",
        batteries: "بطاريات جافة"
      },

      /* ------- وصف كل قسم وفئة · department and category descriptions */

      /* ------------------------------- صفحة المنتج · the product page */
      detailsTitle: "تفاصيل المنتج",
      productCode: "رمز المنتج",
      quantity: "الكمية",
      addToCart: "أضف إلى السلة",
      inStock: "متوفر",
      outOfStock: "غير متوفر حالياً",
      outOfStockNote: "غير متوفر حالياً — اطلب منّا أن نبلغك عند وصوله.",
      stockNotify: "أخبرني عندما يتوفر",
      stockNotifyIntro: "أبلغوني عند توفر هذا المنتج:",
      askAboutProduct: "اسأل عنه على واتساب",
      shareProduct: "مشاركة المنتج",
      addFavorite: "أضف هذا المنتج إلى المفضلة",
      removeFavorite: "أزل هذا المنتج من المفضلة",
      orderSingleIntro: "مرحباً سمارت تك، أريد الاستفسار عن هذا المنتج:",
      orderLink: "رابط المنتج:",
      orderRef: "رقم الطلب",

      /* ---- شارات الثقة في صفحة المنتج · the product page trust chips */
      benefitOriginalTitle: "أصلي بضمان المصنّع",
      benefitShippingText: "توصيل لكل المحافظات",
      benefitSupportTitle: "نؤكّد الطلب قبل الشحن",

      /* ------------------------------------- معرض الصور · the gallery */
      imageOf: "الصورة {n} من {total}",

      /* ---------------------------- اختيار اللون · the colour chooser */

      /* -------------------------- المواصفات · the specification block */

      /* --------------------------------------------- السلة · the cart */

      /* --------------------------------------- إتمام الطلب · checkout */

      /* --------------------------------- المحافظات · the governorates */

      /* --------------------- صفحة تأكيد الطلب · the confirmation page */

      /* -------------------------- رسالة واتساب · the WhatsApp message */

      /* ------------------------ ما يُقرأ بصوت عالٍ · the live regions */
      a11yResults: "تم عرض {n} من المنتجات.",
      a11yNoResults: "لا توجد منتجات مطابقة.",
      a11yMore: "تمت إضافة مزيد من المنتجات إلى القائمة.",
      a11yFiltered: "بقي {n} من المنتجات بعد التصفية.",
      a11yFiltersCleared: "أُزيلت كل التصفيات.",
      a11yFavAdded: "أُضيف المنتج إلى المفضلة.",
      a11yFavRemoved: "أُزيل المنتج من المفضلة.",
      a11yLoadFailed: "تعذّر تحميل المنتجات. حدّث الصفحة من فضلك.",

      /* The cart sheet's words. Its markup ships with the page,
         so its keys must resolve before cart.js is fetched. */
      "cartDecrease": "إنقاص الكمية",
      "cartIncrease": "زيادة الكمية",
    },

    en: {
      /* ----------------- الهوية ووسوم الصفحة · identity and page tags */
      brandName: "SmartTech",
      pageTitle: "SmartTech | Genuine Anker products, wholesale & retail — Azaz, Aleppo",
      metaDescription: "SmartTech in Azaz, Aleppo: chargers, power banks and audio from Anker, soundcore and eufy. Wholesale and retail, order on WhatsApp.",

      /* ------------------------ الرأس والتنقل · header and navigation */
      skipToMain: "Skip to content",
      skipToProducts: "Skip to content",
      homeTitle: "SmartTech — 100% genuine Anker products",
      navHome: "Home",
      navDepts: "Departments",
      navSearch: "Search",
      navCart: "Cart",
      navWhatsApp: "WhatsApp",
      navFavourites: "Favourites",
      navBrowse: "All departments",
      navBrands: "Brands",
      navOffers: "Offers",
      bottomBarLabel: "Quick navigation",
      languageLabel: "Language",
      close: "Close",
      closeLabel: "Close",
      back: "Back",
      imagePreview: "Image preview",

      /* ----------------------------------------------- البحث · search */
      searchLabel: "Search",
      searchPlaceholder: "Search for a product, department or brand",
      searchClear: "Clear search",
      searchSuggest: "Search suggestions",
      searchTitle: "Results for “{q}”",
      searchSimilar: "Similar results ({n})",
      searchInDepts: "In departments",
      searchInBrands: "Brand",

      /* --------------------------------------- الصفحة الرئيسية · home */
      homeDeptsWord: "departments",
      homeItemsWord: "products",
      homeAuthorised: "Wholesale & retail",
      heroBadge: "100% genuine Anker products",
      heroTitle: "100% genuine Anker products",
      heroSub: "Wholesale & retail — Azaz, Aleppo",
      heroOrder: "Order on WhatsApp",
      heroBrowse: "Browse products",
      promoBar: "In stock now — wholesale & retail",
      navAnker: "Anker",
      navSoundcore: "Soundcore",
      navAccessories: "Phone accessories",
      navWholesale: "Wholesale",
      navContact: "Contact us",
      navBrandsLabel: "Brands",
      deptsTitle: "Departments",
      deptsAllIn: "Everything in {name}",
      deptsBrands: "Brands",
      railPopular: "Most popular",
      railOffers: "Offers",
      railNew: "Just arrived",
      railAll: "See all",

      /* ------------------------------ بطاقة المنتج · the product card */
      cardOff: "{n} off",
      cardPriceFrom: "From {price}",
      cardOut: "Out of stock",
      cardColoursOne: "One colour",
      cardColoursTwo: "Two colours",
      cardColoursFew: "{n} colours",
      cardColoursMany: "{n} colours",
      cardFav: "Add {name} to your favourites",
      cardUnfav: "Remove {name} from your favourites",
      cardAdded: "Added",

      /* -------------------------- التصفية والترتيب · filters and sort */
      filterTitle: "Filter",
      filterClear: "Clear all",
      filterShow: "Show {n} results",
      filterRemove: "Remove this filter",
      filterBrandLegend: "Brand",
      filterDeviceLegend: "Your device",
      filterPriceLegend: "Price",
      filterPriceFrom: "From",
      filterPriceTo: "To",
      filterStockLegend: "Availability",
      filterInStock: "In stock only",
      sortLabel: "Sort",
      sortRelevance: "Best match",
      sortPopular: "Most popular",
      sortCheap: "Cheapest first",
      sortDear: "Most expensive first",
      sortNewest: "Newest",
      sortDiscount: "Biggest discount",

      /* --------------------- عدّ النتائج والصفحات · counts and paging */
      resultRange: "Showing {range} of {total} products",
      pagerMore: "Show {n} more",
      pagerLabel: "Result pages",
      pagerPrev: "Previous",
      pagerNext: "Next",
      allTitle: "All products",
      favTitle: "Favourites",
      dealsTitle: "Offers",

      /* ------------------------------- الحالات الفارغة · empty states */
      emptySearchTitle: "No results for “{q}”",
      emptySearchText: "Try a shorter word, or check the spelling.",
      emptySearchAsk: "Ask us on WhatsApp",
      emptyDidYouMean: "Did you mean",
      emptyNear: "Close matches",
      emptyBrowse: "Browse the departments",
      emptyFavTitle: "Nothing saved yet",
      emptyFavText: "Tap the heart on any product to keep it here.",
      emptyFavAction: "Browse the most popular",
      emptyFilterTitle: "No results with these filters",
      emptyFilterText: "Remove one of the filters to widen the results.",
      emptyNodeTitle: "{name} is being restocked",
      emptyNodeText: "Nothing here right now. New stock arrives regularly.",
      emptyNodeAsk: "Ask about availability on WhatsApp",

      /* --------------------------- العلامات والثقة · brands and trust */
      brandStripTitle: "Shop by brand",
      brandStripAll: "All brands",
      trustTitle: "Why SmartTech",
      trustGenuineTitle: "Genuine stock",
      trustGenuineText: "Genuine Anker, soundcore and eufy products, in their box with their accessories.",
      trustDeliveryTitle: "Delivery to every governorate",
      trustDeliveryText: "We ship to every Syrian governorate. The delivery charge depends on your city and is agreed before we ship.",
      trustPriceTitle: "A clear price before you order",
      trustPriceText: "The price you see is the price — no fees appear later.",
      trustDistributor: "SmartTech is a store in Azaz, Aleppo selling Anker, soundcore and eufy products wholesale and retail.",

      /* --------------------------------------------- التذييل · footer */
      footerAbout: "A store in Azaz, Aleppo for genuine Anker products, wholesale and retail.",
      footerDepts: "Departments",
      footerShop: "Shop",
      footerHelp: "Help",
      footerShipping: "Shipping and delivery",
      footerWarranty: "Warranty and returns",
      footerContact: "Contact us",
      footerAdmin: "Store admin",
      footerInstall: "Install the app",
      installIosHint: "Tap Share, then “Add to Home Screen”",
      footerNote: "All names and trademarks are the property of their owners.",
      footerRights: "© {year} SmartTech",
      footerRightsFallback: "© SmartTech",

      /* --------- الصفحات المولّدة على الخادم · server-rendered routes */
      routeHome: "Home",
      routeCrumbLabel: "Breadcrumb",
      routeListLabel: "{label} products",
      routeCountOne: "one product",
      routeCountTwo: "two products",
      routeCountFew: "{n} products",
      routeCountMany: "{n} products",
      routeBrowse: "All departments",
      routeBrowseTitle: "All departments — {count} | {site}",
      routeBrowseDesc: "Browse every SmartTech department and category on one page: {count}, grouped by department, with a count for each.",
      routeBrands: "Brands",
      routeBrandsTitle: "Brands — {count} | {site}",
      routeBrandsDesc: "Every brand we distribute in Syria, with the number of products behind each: {count}, all genuine and under the manufacturer's warranty.",
      routeCatHeading: "{label} in Syria",
      routeCatTitle: "{label} — {count} | {site}",
      routeCatDesc: "Shop {label}: {count} from {brand} and others, priced {min} to {max}. Genuine products, order on WhatsApp.",
      routeBrandHeading: "{brand} in Syria",
      routeBrandTitle: "{brand} — {count} | {site}",
      routeBrandDesc: "Every genuine {brand} product in Syria: {count} priced {min} to {max}, with the manufacturer's warranty and delivery to every governorate.",

      /* -------- أسماء الأقسام والفئات · department and category names */
      cat: {
        charging: "Charging and cables",
        "power-banks": "Power banks",
        "wall-chargers": "Wall chargers",
        cables: "Cables",
        "wireless-chargers": "Wireless chargers",
        "car-charging": "Car chargers",
        "solar-chargers": "Solar chargers",
        "phone-acc": "Phone accessories",
        cases: "Cases",
        "wallets-grips": "Wallets and grips",
        "watch-bands": "Watch bands",
        "sound-vision": "Sound and vision",
        earbuds: "Earbuds",
        headphones: "Headphones",
        speakers: "Speakers",
        projectors: "Projectors",
        "av-accessories": "Stands and accessories",
        security: "Security",
        cameras: "Security cameras",
        doorbells: "Video doorbells",
        locks: "Smart locks",
        sensors: "Sensors and alarms",
        recorders: "Recorders and hubs",
        home: "Smart home",
        vacuums: "Robot vacuums",
        "health-baby": "Baby and care",
        makers: "UV printers",
        "smart-living": "Smart lighting and displays",
        energy: "Solar and power",
        "power-stations": "Power stations",
        "solar-panels": "Solar panels",
        "off-grid": "Off-grid appliances",
        computing: "Computing and storage",
        "hubs-docks": "Hubs and docks",
        storage: "Storage",
        parts: "Spares and consumables",
        "vacuum-parts": "Vacuum spares",
        batteries: "Alkaline batteries"
      },

      /* ------- وصف كل قسم وفئة · department and category descriptions */

      /* ------------------------------- صفحة المنتج · the product page */
      detailsTitle: "Product details",
      productCode: "Product code",
      quantity: "Quantity",
      addToCart: "Add to cart",
      inStock: "In stock",
      outOfStock: "Out of stock",
      outOfStockNote: "Out of stock right now — ask us to tell you when it lands.",
      stockNotify: "Tell me when it is back",
      stockNotifyIntro: "Let me know when this product is back in stock:",
      askAboutProduct: "Ask about it on WhatsApp",
      shareProduct: "Share this product",
      addFavorite: "Add this product to your favourites",
      removeFavorite: "Remove this product from your favourites",
      orderSingleIntro: "Hello SmartTech, I have a question about this product:",
      orderLink: "Product link:",
      orderRef: "Order number",

      /* ---- شارات الثقة في صفحة المنتج · the product page trust chips */
      benefitOriginalTitle: "Genuine, with the maker's warranty",
      benefitShippingText: "Delivery to every governorate",
      benefitSupportTitle: "We confirm before we ship",

      /* ------------------------------------- معرض الصور · the gallery */
      imageOf: "Photo {n} of {total}",

      /* ---------------------------- اختيار اللون · the colour chooser */

      /* -------------------------- المواصفات · the specification block */

      /* --------------------------------------------- السلة · the cart */

      /* --------------------------------------- إتمام الطلب · checkout */

      /* --------------------------------- المحافظات · the governorates */

      /* --------------------- صفحة تأكيد الطلب · the confirmation page */

      /* -------------------------- رسالة واتساب · the WhatsApp message */

      /* ------------------------ ما يُقرأ بصوت عالٍ · the live regions */
      a11yResults: "Showing {n} products.",
      a11yNoResults: "No products match.",
      a11yMore: "More products have been added to the list.",
      a11yFiltered: "After filtering, {n} products remain.",
      a11yFiltersCleared: "All the filters have been cleared.",
      a11yFavAdded: "The product has been added to your favourites.",
      a11yFavRemoved: "The product has been removed from your favourites.",
      a11yLoadFailed: "We could not load the products. Please refresh the page.",

      /* The cart sheet's words. Its markup ships with the page,
         so its keys must resolve before cart.js is fetched. */
      "cartDecrease": "Decrease the quantity",
      "cartIncrease": "Increase the quantity",
    },

    tr: {
      /* ----------------- الهوية ووسوم الصفحة · identity and page tags */
      brandName: "SmartTech",
      pageTitle: "SmartTech | Orijinal Anker ürünleri, toptan ve perakende — Azaz, Halep",
      metaDescription: "Azaz, Halep'teki SmartTech: Anker, soundcore ve eufy şarj cihazları, powerbank ve ses ürünleri. Toptan ve perakende, WhatsApp ile sipariş.",

      /* ------------------------ الرأس والتنقل · header and navigation */
      skipToMain: "İçeriğe geç",
      skipToProducts: "Doğrudan içeriğe geç",
      homeTitle: "SmartTech — %100 orijinal Anker ürünleri",
      navHome: "Ana sayfa",
      navDepts: "Bölümler",
      navSearch: "Ara",
      navCart: "Sepet",
      navWhatsApp: "WhatsApp mesajı",
      navFavourites: "Favoriler",
      navBrowse: "Tüm bölümler",
      navBrands: "Markalar",
      navOffers: "Fırsatlar",
      bottomBarLabel: "Hızlı gezinme",
      languageLabel: "Dil",
      close: "Kapat",
      closeLabel: "Pencereyi kapat",
      back: "Geri",
      imagePreview: "Görsel önizleme",

      /* ----------------------------------------------- البحث · search */
      searchLabel: "Ara",
      searchPlaceholder: "Ürün, bölüm veya marka arayın",
      searchClear: "Aramayı temizle",
      searchSuggest: "Arama önerileri",
      searchTitle: "“{q}” için sonuçlar",
      searchSimilar: "Benzer sonuçlar ({n})",
      searchInDepts: "Bölümlerde",
      searchInBrands: "Marka",

      /* --------------------------------------- الصفحة الرئيسية · home */
      homeDeptsWord: "bölüm",
      homeItemsWord: "ürün",
      homeAuthorised: "Toptan ve perakende",
      heroBadge: "%100 orijinal Anker ürünleri",
      heroTitle: "%100 orijinal Anker ürünleri",
      heroSub: "Toptan ve perakende — Azaz, Halep",
      heroOrder: "WhatsApp ile sipariş ver",
      heroBrowse: "Ürünlere göz at",
      promoBar: "Şimdi stokta — toptan ve perakende",
      navAnker: "Anker",
      navSoundcore: "Soundcore",
      navAccessories: "Telefon aksesuarları",
      navWholesale: "Toptan",
      navContact: "Bize ulaşın",
      navBrandsLabel: "Markalar",
      deptsTitle: "Bölümler",
      deptsAllIn: "{name} bölümünün tamamı",
      deptsBrands: "Markalar",
      railPopular: "En çok tercih edilenler",
      railOffers: "Fırsatlar",
      railNew: "Yeni gelenler",
      railAll: "Tümünü gör",

      /* ------------------------------ بطاقة المنتج · the product card */
      cardOff: "{n} indirim",
      cardPriceFrom: "{price} fiyatından başlar",
      cardOut: "Stokta yok",
      cardColoursOne: "Tek renk",
      cardColoursTwo: "İki renk",
      cardColoursFew: "{n} renk",
      cardColoursMany: "{n} renk",
      cardFav: "{name} ürününü favorilerinize ekleyin",
      cardUnfav: "{name} ürününü favorilerinizden çıkarın",
      cardAdded: "Eklendi",

      /* -------------------------- التصفية والترتيب · filters and sort */
      filterTitle: "Filtrele",
      filterClear: "Tümünü temizle",
      filterShow: "{n} sonucu göster",
      filterRemove: "Bu filtreyi kaldır",
      filterBrandLegend: "Marka",
      filterDeviceLegend: "Cihazınız",
      filterPriceLegend: "Fiyat",
      filterPriceFrom: "En az",
      filterPriceTo: "En çok",
      filterStockLegend: "Stok durumu",
      filterInStock: "Yalnızca stokta olanlar",
      sortLabel: "Sırala",
      sortRelevance: "En uygun",
      sortPopular: "En çok tercih edilen",
      sortCheap: "Önce en ucuz",
      sortDear: "Önce en pahalı",
      sortNewest: "En yeni",
      sortDiscount: "En yüksek indirim",

      /* --------------------- عدّ النتائج والصفحات · counts and paging */
      resultRange: "{total} ürünün {range} arası gösteriliyor",
      pagerMore: "{n} ürün daha göster",
      pagerLabel: "Sonuç sayfaları",
      pagerPrev: "Önceki",
      pagerNext: "Sonraki",
      allTitle: "Tüm ürünler",
      favTitle: "Favoriler",
      dealsTitle: "Fırsatlar",

      /* ------------------------------- الحالات الفارغة · empty states */
      emptySearchTitle: "“{q}” için sonuç yok",
      emptySearchText: "Daha kısa bir kelime deneyin veya yazımı kontrol edin.",
      emptySearchAsk: "WhatsApp'tan sorun",
      emptyDidYouMean: "Bunu mu demek istediniz",
      emptyNear: "Yakın sonuçlar",
      emptyBrowse: "Bölümlere göz atın",
      emptyFavTitle: "Henüz kayıtlı ürün yok",
      emptyFavText: "Burada durması için herhangi bir üründeki kalbe dokunun.",
      emptyFavAction: "En çok tercih edilenlere göz atın",
      emptyFilterTitle: "Bu filtrelerle sonuç yok",
      emptyFilterText: "Sonuçları genişletmek için filtrelerden birini kaldırın.",
      emptyNodeTitle: "{name} yeniden stokleniyor",
      emptyNodeText: "Şu anda burada ürün yok. Yeni stok düzenli olarak geliyor.",
      emptyNodeAsk: "Stok durumunu WhatsApp'tan sorun",

      /* --------------------------- العلامات والثقة · brands and trust */
      brandStripTitle: "Markaya göre alışveriş",
      brandStripAll: "Tüm markalar",
      trustTitle: "Neden SmartTech",
      trustGenuineTitle: "Orijinal ürün",
      trustGenuineText: "Kutusu ve aksesuarlarıyla orijinal Anker, soundcore ve eufy ürünleri.",
      trustDeliveryTitle: "Tüm illere teslimat",
      trustDeliveryText: "Suriye'nin tüm illerine gönderiyoruz. Teslimat ücreti şehrinize göre belirlenir ve gönderimden önce onaylanır.",
      trustPriceTitle: "Sipariş öncesi net fiyat",
      trustPriceText: "Gördüğünüz fiyat nihai fiyattır; sonradan çıkan ücret yoktur.",
      trustDistributor: "SmartTech, Azaz/Halep'te Anker, soundcore ve eufy ürünlerini toptan ve perakende satan bir mağazadır.",

      /* --------------------------------------------- التذييل · footer */
      footerAbout: "Azaz/Halep'te orijinal Anker ürünleri için toptan ve perakende bir mağaza.",
      footerDepts: "Bölümler",
      footerShop: "Mağaza",
      footerHelp: "Yardım",
      footerShipping: "Kargo ve teslimat",
      footerWarranty: "Garanti ve iade",
      footerContact: "Bize ulaşın",
      footerAdmin: "Mağaza yönetimi",
      footerInstall: "Uygulamayı yükle",
      installIosHint: "Paylaş'a dokunun, ardından “Ana Ekrana Ekle”",
      footerNote: "Tüm adlar ve ticari markalar sahiplerine aittir.",
      footerRights: "© {year} SmartTech",
      footerRightsFallback: "© SmartTech",

      /* --------- الصفحات المولّدة على الخادم · server-rendered routes */
      routeHome: "Ana sayfa",
      routeCrumbLabel: "Gezinme yolu",
      routeListLabel: "{label} ürünleri",
      routeCountOne: "bir ürün",
      routeCountTwo: "iki ürün",
      routeCountFew: "{n} ürün",
      routeCountMany: "{n} ürün",
      routeBrowse: "Tüm bölümler",
      routeBrowseTitle: "Tüm bölümler — {count} | {site}",
      routeBrowseDesc: "SmartTech'in tüm bölüm ve kategorilerini tek sayfada görün: {count}, bölüme göre gruplanmış ve her kategoride ürün sayısıyla.",
      routeBrands: "Markalar",
      routeBrandsTitle: "Markalar — {count} | {site}",
      routeBrandsDesc: "Suriye'de dağıttığımız tüm markalar ve her birinin arkasındaki ürün sayısı: {count}, tamamı orijinal ve üretici garantili.",
      routeCatHeading: "Suriye'de {label}",
      routeCatTitle: "{label} — {count} | {site}",
      routeCatDesc: "{label} alışverişi: {brand} ve diğer markalardan {count}, {min} ile {max} arası fiyatlarla. Orijinal ürünler, WhatsApp ile sipariş.",
      routeBrandHeading: "Suriye'de {brand}",
      routeBrandTitle: "{brand} — {count} | {site}",
      routeBrandDesc: "Suriye'deki tüm orijinal {brand} ürünleri: {min} ile {max} arası fiyatlarla {count}, üretici garantili ve tüm illere teslimat.",

      /* -------- أسماء الأقسام والفئات · department and category names */
      cat: {
        charging: "Şarj ve kablolar",
        "power-banks": "Powerbank",
        "wall-chargers": "Priz şarj cihazları",
        cables: "Kablolar",
        "wireless-chargers": "Kablosuz şarj cihazları",
        "car-charging": "Araç şarj cihazları",
        "solar-chargers": "Güneş enerjili şarj",
        "phone-acc": "Telefon aksesuarları",
        cases: "Kılıflar",
        "wallets-grips": "Cüzdanlar ve tutacaklar",
        "watch-bands": "Saat kordonları",
        "sound-vision": "Ses ve görüntü",
        earbuds: "Kablosuz kulaklıklar",
        headphones: "Kulak üstü kulaklıklar",
        speakers: "Hoparlörler",
        projectors: "Projeksiyon cihazları",
        "av-accessories": "Standlar ve aksesuarlar",
        security: "Güvenlik",
        cameras: "Güvenlik kameraları",
        doorbells: "Görüntülü kapı zilleri",
        locks: "Akıllı kilitler",
        sensors: "Sensörler ve alarmlar",
        recorders: "Kayıt cihazları",
        home: "Akıllı ev",
        vacuums: "Robot süpürgeler",
        "health-baby": "Bebek ve bakım",
        makers: "UV yazıcılar",
        "smart-living": "Akıllı aydınlatma ve ekranlar",
        energy: "Güneş enerjisi ve güç",
        "power-stations": "Güç istasyonları",
        "solar-panels": "Güneş panelleri",
        "off-grid": "Şebekeden bağımsız cihazlar",
        computing: "Bilgisayar ve depolama",
        "hubs-docks": "Hub ve yerleştirme istasyonları",
        storage: "Depolama",
        parts: "Yedek parçalar",
        "vacuum-parts": "Süpürge yedek parçaları",
        batteries: "Alkalin piller"
      },

      /* ------- وصف كل قسم وفئة · department and category descriptions */

      /* ------------------------------- صفحة المنتج · the product page */
      detailsTitle: "Ürün ayrıntıları",
      productCode: "Ürün kodu",
      quantity: "Adet",
      addToCart: "Sepete ekle",
      inStock: "Stokta var",
      outOfStock: "Stokta yok",
      outOfStockNote: "Şu anda stokta yok — geldiğinde haber vermemizi isteyin.",
      stockNotify: "Gelince haber verin",
      stockNotifyIntro: "Bu ürün stoğa girince bana haber verin:",
      askAboutProduct: "WhatsApp'tan sorun",
      shareProduct: "Bu ürünü paylaşın",
      addFavorite: "Bu ürünü favorilerinize ekleyin",
      removeFavorite: "Bu ürünü favorilerinizden çıkarın",
      orderSingleIntro: "Merhaba SmartTech, bu ürün hakkında bilgi almak istiyorum:",
      orderLink: "Ürün bağlantısı:",
      orderRef: "Sipariş numarası",

      /* ---- شارات الثقة في صفحة المنتج · the product page trust chips */
      benefitOriginalTitle: "Orijinal, üretici garantili",
      benefitShippingText: "Tüm illere teslimat",
      benefitSupportTitle: "Göndermeden önce onaylarız",

      /* ------------------------------------- معرض الصور · the gallery */
      imageOf: "{total} fotoğraftan {n}. fotoğraf",

      /* ---------------------------- اختيار اللون · the colour chooser */

      /* -------------------------- المواصفات · the specification block */

      /* --------------------------------------------- السلة · the cart */

      /* --------------------------------------- إتمام الطلب · checkout */

      /* --------------------------------- المحافظات · the governorates */

      /* --------------------- صفحة تأكيد الطلب · the confirmation page */

      /* -------------------------- رسالة واتساب · the WhatsApp message */

      /* ------------------------ ما يُقرأ بصوت عالٍ · the live regions */
      a11yResults: "{n} ürün gösteriliyor.",
      a11yNoResults: "Eşleşen ürün yok.",
      a11yMore: "Listeye daha fazla ürün eklendi.",
      a11yFiltered: "Filtrelemeden sonra {n} ürün kaldı.",
      a11yFiltersCleared: "Tüm filtreler temizlendi.",
      a11yFavAdded: "Ürün favorilerinize eklendi.",
      a11yFavRemoved: "Ürün favorilerinizden çıkarıldı.",
      a11yLoadFailed: "Ürünler yüklenemedi. Lütfen sayfayı yenileyin.",

      /* The cart sheet's words. Its markup ships with the page,
         so its keys must resolve before cart.js is fetched. */
      "cartDecrease": "Adedi azaltın",
      "cartIncrease": "Adedi artırın",
    }
  };

  const STORAGE_KEY = "smarttech_lang";
  const codes = languages.map(l => l.code);
  const fallback = codes[0];

  function normalize(code) {
    const value = String(code || "").toLowerCase();
    return codes.find(c => value === c || value.startsWith(c + "-")) || "";
  }
  function stored() {
    try { return normalize(localStorage.getItem(STORAGE_KEY)); } catch (e) { return ""; }
  }
  function detect() {
    // A page may pin its own default — the admin panel is Arabic-first because
    // it has one user, while the storefront follows the visitor's device.
    const root = typeof document !== "undefined" && document.documentElement;
    const pinned = root && root.dataset ? root.dataset.defaultLang : "";
    if (pinned && normalize(pinned) && !stored()) return normalize(pinned);
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || [];
    for (const item of list) { const code = normalize(item); if (code) return code; }
    return fallback;
  }
  function fromUrl() {
    try { return normalize(new URLSearchParams(location.search).get("lang")); } catch (e) { return ""; }
  }
  const forced = fromUrl();
  let current = forced || stored() || detect();
  if (forced) { try { localStorage.setItem(STORAGE_KEY, forced); } catch (e) {} }

  function meta(code) { return languages.find(l => l.code === (code || current)) || languages[0]; }

  function lookup(code, key) {
    const table = dict[code];
    /* A dotted key has two shapes and both are the same key. The base file
       nests it — `catDesc: { audio: "..." }` — because that is how it is
       written by hand; a generated chunk stores it flat, as the pair
       `"catDesc.audio": "..."`, because it is generated as a list. Walking
       only the nested shape meant every category description and every
       governorate resolved to nothing the moment those keys actually moved
       into their chunk, which is exactly what the split was for. */
    if (table && typeof table[key] === "string") return table[key];
    const parts = String(key).split(".");
    let node = table;
    for (const part of parts) {
      if (!node || typeof node !== "object" || !(part in node)) return undefined;
      node = node[part];
    }
    return typeof node === "string" ? node : undefined;
  }

  // Missing keys render visibly so the language test catches them.
  function t(key, vars, code) {
    const lang = code || current;
    let value = lookup(lang, key);
    if (value === undefined) value = lookup(fallback, key);
    if (value === undefined) return "⟦" + key + "⟧";
    if (vars) {
      Object.keys(vars).forEach(name => {
        value = value.split("{" + name + "}").join(String(vars[name]));
      });
    }
    return value;
  }

  function set(code) {
    const next = normalize(code);
    if (!next) return current;
    current = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    return current;
  }

  // Fills every element marked with data-i18n / data-i18n-html / data-i18n-attr.
  /* A key this language cannot resolve yet must not be written over text that
     is already there. The server renders a category page complete, with the
     description in the markup; i18n-cat.js is a separate request, so apply()
     ran first, found nothing under `catDesc.charging`, and painted the raw
     key over a perfectly good paragraph. Leaving it alone costs nothing — the
     chunk arrives a moment later and apply() runs again — while an element
     that was empty still shows ⟦key⟧, which is what the language test reads.
     A language switch is not affected: after switching, every key resolves. */
  const MARK = "⟦";
  const keep = (el, value) => value.charAt(0) === MARK && el.textContent.trim() !== "";

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach(el => {
      const value = t(el.dataset.i18n);
      if (!keep(el, value)) el.textContent = value;
    });
    scope.querySelectorAll("[data-i18n-html]").forEach(el => {
      const value = t(el.dataset.i18nHtml);
      if (!keep(el, value)) el.innerHTML = value;
    });
    scope.querySelectorAll("[data-i18n-attr]").forEach(el => {
      el.dataset.i18nAttr.split(";").forEach(pair => {
        const [attr, key] = pair.split(":").map(s => s && s.trim());
        if (!attr || !key) return;
        const value = t(key);
        if (value.charAt(0) === MARK && el.getAttribute(attr)) return;
        el.setAttribute(attr, value);
      });
    });
    if (scope === document) {
      const info = meta();
      document.documentElement.lang = info.code;
      document.documentElement.dir = info.dir;
      // A product page arrives with its own title and description already set
      // by the server; replacing them with the home page's would undo it.
      const onProduct = document.body && document.body.dataset && document.body.dataset.productId;
      if (onProduct) return;
      const titleKey = document.documentElement.dataset.titleKey || "pageTitle";
      document.title = t(titleKey);
      const description = document.querySelector('meta[name="description"]');
      if (description) description.setAttribute("content", t("metaDescription"));
    }
  }

  /* ------------------------------------------------------- arriving words */

  /* The dictionary is split by surface, so a page can be drawn before its own
     words have landed. That is not a rare race: api/p.js links product.js
     into the product route server-side, product.js draws the page the moment
     it runs, and i18n-pdp.js is a separate request — so the correct page the
     server had already rendered was replaced by ⟦pdpBuyNow⟧, and nothing ever
     drew it again. The same happened to every category description.
     A chunk arriving is therefore an event, and whoever renders from the
     dictionary listens for it. A listener registered late still hears about
     the chunks that came before it, because "did I miss it" is precisely the
     question this is here to stop anyone having to ask. */
  const chunksIn = [];
  const chunkWatchers = [];
  function onChunk(file) {
    if (chunksIn.indexOf(file) === -1) chunksIn.push(file);
    /* Words that were not there a moment ago are there now: anything still
       showing a raw key can be written properly. */
    if (typeof document !== "undefined" && document.body) {
      try { apply(); } catch (e) {}
    }
    chunkWatchers.slice().forEach(fn => { try { fn(file); } catch (e) {} });
  }
  function whenChunk(fn) {
    if (typeof fn !== "function") return;
    chunkWatchers.push(fn);
    chunksIn.slice().forEach(file => { try { fn(file); } catch (e) {} });
  }

  window.I18N = {
    languages, dict, t, apply, set, normalize,
    get current() { return current; },
    meta, STORAGE_KEY, onChunk, whenChunk, chunks: chunksIn
  };
})();
