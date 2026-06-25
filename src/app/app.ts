import { Component, computed, effect, signal, HostListener, OnDestroy } from '@angular/core';
import {
AfterViewInit,
ElementRef,
ViewChild
} from '@angular/core';

type PriceOption = 'each' | 'pair' | 'bundle6';
type CatalogStatus = 'AV' | 'OOS' | 'CS' | 'LS';
type DiscountType = 'percent' | 'flat';

interface ItemDiscount {
  type: DiscountType;
  value: number;
  label?: string;
}


interface FishItem {
  id: string;
  name: string;
  image: string;
  images?: string[];
  videos?: string[];
  prices: Record<PriceOption, number>;
  discount?: ItemDiscount;
  status?: CatalogStatus;
  visible?: boolean;
  min: number;
  max: number;
  size?: string;
  profile?: FishProfileParameter[];
}

interface CatalogCategory {
  id: string;
  name: string;
  fish: FishItem[];
}

interface PlantItem {
  id: string;
  name: string;
  image: string;
  images?: string[];
  prices?: Partial<Record<PriceOption, number>>;
  priceUnit?: 'stem' | 'portion' | 'plant';
  discount?: ItemDiscount;
  status?: CatalogStatus;
  visible?: boolean;
  min?: number;
  max?: number;
  profile?: FishProfileParameter[];
}

interface PlantCategory {
  id: string;
  name: string;
  plants: PlantItem[];
}

interface DisplayFish extends FishItem {
  categoryId: string;
  categoryName: string;
}

interface DisplayPlant extends PlantItem {
  categoryId: string;
  categoryName: string;
}

interface FishProfileParameter {
  label: string;
  value: string;
}

interface ProfileMedia {
  type: 'image' | 'video';
  src: string;
}

interface CatalogPayload {
  categories: CatalogCategory[];
  plantCategories?: PlantCategory[];
}

interface CatalogSyncConfig {
  remoteUrl?: string;
  fallbackUrl?: string;
  refreshMs?: number;
}

interface CartLine {
  key: string;
  fishId: string;
  itemId?: string;
  itemType?: 'fish' | 'plant';
  name: string;
  option: PriceOption;
  priceUnit?: 'stem' | 'portion' | 'plant';
  unitPrice: number;
  quantity: number;
}

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnDestroy {
  private readonly cartStorageKey = 'raw-aqua-world-cart';
  private readonly quantityWarningTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly mediaNavigatorTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private catalogRefreshTimer?: ReturnType<typeof setInterval>;
  private catalogLoading = false;
  private catalogSyncConfig: Required<CatalogSyncConfig> = {
    remoteUrl: '',
    fallbackUrl: 'catalog.json',
    refreshMs: 60_000,
  };
  readonly businessWhatsapp = '919036597078';

  readonly menuOpen = signal(false);
  readonly searchOpen = signal(false);
  readonly aboutOpen = signal(false);
  readonly galleryOpen = signal(true);
  readonly contactOpen = signal(false);
  readonly shopOpen = signal(true);
  readonly knowMoreOpen = signal(false);
  readonly faqsOpen = signal(false);
  readonly fishProfileOpen = signal(false);
  readonly doaPolicyOpen = signal(true);
  readonly doaPolicyModalOpen = signal(false);
  readonly doaPolicyAccepted = signal(false);
  readonly cartOpen = signal(false);
  readonly selectedShopSection = signal<'live-fish' | 'plants'>('live-fish');
  readonly selectedCategory = signal('all');
  readonly selectedPlantCategory = signal('all');
  readonly searchTerm = signal('');
  readonly customerWhatsapp = signal('');
  readonly customerAddress = signal('');
  readonly catalog = signal<CatalogCategory[]>([]);
  readonly plantCatalog = signal<PlantCategory[]>([]);
  readonly catalogError = signal('');
  readonly catalogLastUpdated = signal<Date | null>(null);
  readonly cart = signal<CartLine[]>([]);
  readonly catalogQuantities = signal<Record<string, number>>({});
  readonly quantityWarnings = signal<Record<string, string>>({});
  readonly itemsPerPage = 8;
  readonly visibleCount = signal(8);
  readonly sideMenuShopOpen = signal(false);
  readonly sideMenuLiveFishOpen = signal(false);
  readonly sideMenuPlantsOpen = signal(false);
  readonly sideMenuKnowMoreOpen = signal(false);
  readonly selectedFishProfile = signal<DisplayFish | null>(null);
  readonly selectedPlantProfile = signal<DisplayPlant | null>(null);
  readonly plantShippingModalOpen = signal(false);
  readonly plantShippingNoticeSeen = signal(false);
  readonly selectedProfileMediaIndex = signal(0);
  readonly selectedCatalogMediaIndices = signal<Record<string, number>>({});
  readonly visibleMediaNavigators = signal<Record<string, boolean>>({});


  readonly galleryImages = [
    { title: 'Breeding rack placeholder', src: 'assets/breeding-room-1.svg' },
    { title: 'Grow-out tanks placeholder', src: 'assets/breeding-room-2.svg' },
    { title: 'Conditioning corner placeholder', src: 'assets/breeding-room-3.svg' },
  ];

  readonly allFish = computed<DisplayFish[]>(() =>
    this.catalog().flatMap((category) =>
      category.fish
        .filter((fish) => fish.visible === true)
        .map((fish) => ({
          ...fish,
          categoryId: category.id,
          categoryName: category.name,
        })),
    ),
  );

  readonly filteredFish = computed(() => {
    const selected = this.selectedCategory();
    const query = this.searchTerm().trim().toLowerCase();

    return this.allFish().filter((fish) => {
      const matchesCategory = selected === 'all' || fish.categoryId === selected;
      const matchesSearch =
        !query ||
        fish.name.toLowerCase().includes(query) ||
        fish.categoryName.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  });

  readonly allPlants = computed<DisplayPlant[]>(() =>
    this.plantCatalog().flatMap((category) =>
      category.plants
        .filter((plant) => plant.visible === true)
        .map((plant) => ({
          ...plant,
          categoryId: category.id,
          categoryName: category.name,
        })),
    ),
  );

  readonly filteredPlants = computed(() => {
    const selected = this.selectedPlantCategory();
    const query = this.searchTerm().trim().toLowerCase();

    return this.allPlants().filter((plant) => {
      const matchesCategory = selected === 'all' || plant.categoryId === selected;
      const matchesSearch =
        !query ||
        plant.name.toLowerCase().includes(query) ||
        plant.categoryName.toLowerCase().includes(query);

      return (
        matchesCategory && matchesSearch
      );
    });
  });

  readonly visibleFish = computed(() => {
    return this.filteredFish().slice(0, this.visibleCount());
  });

  readonly hasMore = computed(() => {
    return this.visibleCount() < this.filteredFish().length;
  });

  readonly cartCount = computed(() => this.cart().reduce((total, line) => total + line.quantity, 0));
  readonly cartTotal = computed(() =>
    this.cart().reduce((total, line) => total + line.quantity * line.unitPrice, 0),
  );
  readonly cartHasPlants = computed(() =>
    this.cart().some((line) => (line.itemType ?? 'fish') === 'plant'),
  );

  constructor() {
    this.loadCart();
    effect(() => this.saveCart(this.cart()));
    void this.initializeCatalogSync();
  }

  ngOnDestroy(): void {
    if (this.catalogRefreshTimer) {
      clearInterval(this.catalogRefreshTimer);
    }
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.loadCatalog(true);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Close menu if clicking outside
    if (!target.closest('.side-menu') && !target.closest('.menu-button')) {
      this.menuOpen.set(false);
    }

    // Close search if clicking outside
    if (!target.closest('.search-box') && !target.closest('[aria-label="Search"]')) {
      this.searchOpen.set(false);
    }

    // Close cart if clicking outside
    if (this.cartOpen() && target.closest('.cart-drawer') && !target.closest('.cart-panel') && !target.closest('.cart-button')) {
    this.cartOpen.set(false);
  }
  }

  private async initializeCatalogSync(): Promise<void> {
    try {
      const response = await fetch('catalog-config.json', { cache: 'no-store' });
      if (response.ok) {
        const config = (await response.json()) as CatalogSyncConfig;
        this.catalogSyncConfig = {
          remoteUrl: config.remoteUrl?.trim() ?? '',
          fallbackUrl: config.fallbackUrl?.trim() || 'catalog.json',
          refreshMs: Math.max(config.refreshMs ?? 60_000, 15_000),
        };
      }
    } catch {
      // The defaults keep the bundled catalogue working when no remote config exists.
    }

    await this.loadCatalog();

    if (typeof window !== 'undefined') {
      this.catalogRefreshTimer = setInterval(
        () => void this.loadCatalog(true),
        this.catalogSyncConfig.refreshMs,
      );
    }
  }

  async loadCatalog(silent = false): Promise<void> {
    if (this.catalogLoading) {
      return;
    }

    this.catalogLoading = true;
    const urls = [this.catalogSyncConfig.remoteUrl, this.catalogSyncConfig.fallbackUrl].filter(
      (url, index, all) => Boolean(url) && all.indexOf(url) === index,
    );

    try {
      for (const url of urls) {
        try {
          const response = await fetch(url, { cache: 'no-store' });
          if (!response.ok) {
            continue;
          }

          const data = (await response.json()) as CatalogPayload;
          if (!this.isValidCatalog(data)) {
            continue;
          }

          this.catalog.set(data.categories);
          this.plantCatalog.set(data.plantCategories ?? []);
          this.catalogLastUpdated.set(new Date());
          this.catalogError.set('');
          return;
        } catch {
          // Try the next configured source without replacing the working catalogue.
        }
      }

      if (!silent || this.catalog().length === 0) {
        this.catalogError.set('Catalog is unavailable right now. The last valid catalogue remains visible.');
      }
    } finally {
      this.catalogLoading = false;
    }
  }

  private isValidCatalog(data: unknown): data is CatalogPayload {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const payload = data as Partial<CatalogPayload>;
    return Array.isArray(payload.categories) &&
      payload.categories.every((category) =>
        typeof category?.id === 'string' &&
        typeof category?.name === 'string' &&
        Array.isArray(category?.fish),
      ) &&
      (payload.plantCategories === undefined ||
        (Array.isArray(payload.plantCategories) &&
          payload.plantCategories.every((category) =>
            typeof category?.id === 'string' &&
            typeof category?.name === 'string' &&
            Array.isArray(category?.plants),
          )));
  }

  loadCart(): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      const savedCart = localStorage.getItem(this.cartStorageKey);
      if (!savedCart) {
        return;
      }

      const parsedCart = JSON.parse(savedCart) as CartLine[];
      if (Array.isArray(parsedCart)) {
        this.cart.set(parsedCart);
      }
    } catch {
      this.cart.set([]);
    }
  }

  saveCart(lines: CartLine[]): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      localStorage.setItem(this.cartStorageKey, JSON.stringify(lines));
    } catch {
      // Ignore storage failures so checkout still works in private browsing modes.
    }
  }

  toggleMenu(): void {
    this.menuOpen.set(!this.menuOpen());
  }

  selectCategory(categoryId: string): void {
    this.selectedShopSection.set('live-fish');
    this.selectedCategory.set(categoryId);
    this.visibleCount.set(this.itemsPerPage);
  }

  selectShopSection(section: 'live-fish' | 'plants'): void {
    this.selectedShopSection.set(section);
    this.visibleCount.set(this.itemsPerPage);
    if (section === 'plants') {
      this.showPlantShippingNotice();
    }
  }

  selectPlantCategory(categoryId: string): void {
    this.selectedShopSection.set('plants');
    this.selectedPlantCategory.set(categoryId);
    this.visibleCount.set(this.itemsPerPage);
    this.showPlantShippingNotice();
  }

  applySearch(value: string): void {
    this.searchTerm.set(value);
    if (value.trim()) {
      this.selectedCategory.set('all');
      this.selectedPlantCategory.set('all');
    }

    if (value.trim() && this.filteredPlants().length && !this.filteredFish().length) {
      this.selectedShopSection.set('plants');
    } else {
      this.selectedShopSection.set('live-fish');
    }
    this.shopOpen.set(true);
    this.visibleCount.set(this.itemsPerPage);
  }

  loadMore(): void {
    this.visibleCount.set(this.visibleCount() + this.itemsPerPage);
  }

  openFishProfile(item: DisplayFish): void {
    this.selectedProfileMediaIndex.set(0);
    this.selectedFishProfile.set(item);
  }

  closeFishProfile(): void {
    this.selectedFishProfile.set(null);
    this.selectedProfileMediaIndex.set(0);
  }

  goToCartFromProfile(): void {
    this.closeFishProfile();
    this.cartOpen.set(true);
  }

  openPlantProfile(item: DisplayPlant): void {
    this.selectedPlantProfile.set(item);
  }

  closePlantProfile(): void {
    this.selectedPlantProfile.set(null);
  }

  goToCartFromPlantProfile(): void {
    this.closePlantProfile();
    this.cartOpen.set(true);
  }

  showPlantShippingNotice(): void {
    if (this.plantShippingNoticeSeen()) {
      return;
    }

    this.plantShippingNoticeSeen.set(true);
    this.plantShippingModalOpen.set(true);
  }

  closePlantShippingNotice(): void {
    this.plantShippingModalOpen.set(false);
  }

  openDoaPolicy(): void {
    this.doaPolicyModalOpen.set(true);
  }

  closeDoaPolicy(): void {
    this.doaPolicyModalOpen.set(false);
  }

  navigateTo(sectionId: string): void {
    if (sectionId === 'shop') {
      this.shopOpen.set(true);
      this.sideMenuShopOpen.set(true);
    }

    if (sectionId === 'about') {
      this.aboutOpen.set(true);
    }

    if (sectionId === 'gallery') {
      this.aboutOpen.set(true);
      this.galleryOpen.set(true);
    }

    if (sectionId === 'contact') {
      this.contactOpen.set(true);
    }

    if (sectionId === 'know-more' || sectionId === 'faqs' || sectionId === 'fish-profile' || sectionId === 'doa-policy') {
      this.knowMoreOpen.set(true);
    }

    if (sectionId === 'faqs') {
      this.faqsOpen.set(true);
    }

    if (sectionId === 'fish-profile') {
      this.fishProfileOpen.set(true);
    }

    if (sectionId === 'doa-policy') {
      this.doaPolicyOpen.set(true);
    }

    this.menuOpen.set(false);
    requestAnimationFrame(() => {
      const section = document.getElementById(sectionId);
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      section?.focus({ preventScroll: true });
    });
  }

  getItemQuantity(itemId: string, minValue: number): number {
    return this.cart().find((line) => line.fishId === itemId)?.quantity ?? this.catalogQuantities()[itemId] ?? minValue;
  }

  quantityWarning(fishId: string): string {
    return this.quantityWarnings()[fishId] ?? '';
  }

  clearQuantityWarning(fishId: string): void {
    const timer = this.quantityWarningTimers.get(fishId);
    if (timer) {
      clearTimeout(timer);
    }
    this.quantityWarningTimers.delete(fishId);
    this.quantityWarnings.update((warnings) => {
      const { [fishId]: _removed, ...rest } = warnings;
      return rest;
    });
  }

  updateItemQuantity(itemId: string, quantity: number, minValue: number, maxValue: number): void {
    if (quantity < minValue) {
      clearTimeout(this.quantityWarningTimers.get(itemId));
      this.quantityWarnings.update((warnings) => ({
        ...warnings,
        [itemId]: `Minimum order quantity is ${minValue}.`,
      }));
      this.quantityWarningTimers.set(
        itemId,
        setTimeout(() => this.clearQuantityWarning(itemId), 2000),
      );
      return;
    }

    if (quantity > maxValue) {
      clearTimeout(this.quantityWarningTimers.get(itemId));
      this.quantityWarnings.update((warnings) => ({
        ...warnings,
        [itemId]: `Maximum order quantity is ${maxValue}.`,
      }));
      this.quantityWarningTimers.set(
        itemId,
        setTimeout(() => this.clearQuantityWarning(itemId), 2000),
      );
      return;
    }

    this.clearQuantityWarning(itemId);

    const nextQuantity = Math.max(minValue, Math.min(quantity, maxValue));
    const existingCartLine = this.cart().find((line) => line.fishId === itemId);

    if (existingCartLine) {
      this.cart.update((lines) =>
        lines.map((line) =>
          line.fishId === itemId ? { ...line, quantity: nextQuantity } : line
        ),
      );
      return;
    }

    this.catalogQuantities.update((qty) => ({
      ...qty,
      [itemId]: nextQuantity,
    }));
  }

  isInCart(itemId: string, itemType: 'fish' | 'plant' = 'fish'): boolean {
    return this.cart().some((line) => line.fishId === itemId && (line.itemType ?? 'fish') === itemType);
  }

  itemStatus(item: FishItem | PlantItem): CatalogStatus {
    return item.status ?? 'AV';
  }

  isPurchasable(item: FishItem | PlantItem): boolean {
    const status = this.itemStatus(item);
    return status === 'AV' || status === 'LS';
  }

  statusLabel(item: FishItem | PlantItem): string {
    switch (this.itemStatus(item)) {
      case 'OOS':
        return 'Out Of Stock';
      case 'CS':
        return 'Coming Soon';
      case 'LS':
        return 'Limited stock';
      default:
        return '';
    }
  }

  statusClass(item: FishItem | PlantItem): string {
    return `status-${this.itemStatus(item).toLowerCase()}`;
  }

  discountedPrice(item: FishItem | PlantItem): number | null {
    const originalPrice = item.prices?.each;
    const discount = item.discount;

    if (!originalPrice || !discount || discount.value <= 0) {
      return null;
    }

    const discounted =
      discount.type === 'percent'
        ? originalPrice - (originalPrice * discount.value) / 100
        : originalPrice - discount.value;

    return Math.max(0, Math.round(discounted));
  }

  itemUnitPrice(item: FishItem | PlantItem): number {
    return this.discountedPrice(item) ?? item.prices?.each ?? 0;
  }

  plantPriceUnit(item: PlantItem): string {
    return item.priceUnit ?? 'portion';
  }

  cartLineUnitLabel(line: CartLine): string {
    if ((line.itemType ?? 'fish') === 'plant' && line.priceUnit) {
      return this.capitalize(line.priceUnit);
    }

    return this.optionLabel(line.option);
  }

  private capitalize(value: string): string {
    return value ? value[0].toUpperCase() + value.slice(1) : value;
  }

  discountLabel(item: FishItem | PlantItem): string {
    const discount = item.discount;
    if (!discount || discount.value <= 0) {
      return '';
    }

    if (discount.label) {
      return discount.label;
    }

    return discount.type === 'percent' ? `${discount.value}% OFF` : `₹${discount.value} OFF`;
  }

  addToCart(item: DisplayFish | DisplayPlant, quantity: number): void {
    if (!this.isPurchasable(item)) {
      return;
    }

    const itemType: 'fish' | 'plant' = this.allPlants().some((plant) => plant.id === item.id) ? 'plant' : 'fish';
    const priceUnit = itemType === 'plant' && 'priceUnit' in item ? item.priceUnit : undefined;
    const key = `${itemType}-${item.id}-each`;
    const existing = this.cart().find((line) => line.key === key);

    if (existing) {
      this.cart.update((lines) =>
        lines.map((line) =>
          line.key === key ? { ...line, quantity: line.quantity + quantity } : line
        ),
      );
    } else {
      this.cart.update((lines) => [
        ...lines,
        {
          key,
          fishId: item.id,
          itemId: item.id,
          itemType,
          name: item.name,
          option: 'each',
          priceUnit,
          unitPrice: this.itemUnitPrice(item),
          quantity,
        },
      ]);
    }
  }

  changeQty(key: string, amount: number): void {
  const cartLine = this.cart().find((line) => line.key === key);
  if (!cartLine) return;

  const itemType = cartLine.itemType ?? 'fish';
  const item =
    itemType === 'plant'
      ? this.allPlants().find((plant) => plant.id === cartLine.fishId)
      : this.allFish().find((fish) => fish.id === cartLine.fishId);
  const minQty = item?.min ?? 1;
  const maxQty = item?.max ?? 999;

  this.cart.update((lines) =>
    lines
      .map((line) =>
        line.key === key
          ? {
              ...line,
              quantity: Math.max(minQty, Math.min(line.quantity + amount, maxQty)),
            }
          : line
      )
      .filter((line) => line.quantity > 0),
  );
}

  removeFromCart(key: string): void {
    this.cart.update((lines) => lines.filter((line) => line.key !== key));
  }

  optionLabel(option: PriceOption): string {
    return option === 'bundle6' ? 'Bundle of 6' : option[0].toUpperCase() + option.slice(1);
  }

  fishProfileSummary(item: DisplayFish): string {
    switch (item.categoryId) {
      case 'tetra':
        return 'Best planned in groups of 6 or more. Peaceful schooling fish for stable, planted community aquariums with gentle tankmates.';
      case 'corydoras':
        return 'Best planned in groups of 6 or more. Social bottom dwellers that do best with clean water, soft substrate, and space to forage.';
      case 'plecos':
        return 'Preferably planned as a pair when the aquarium has suitable space and caves. Grazing catfish with species-specific diet, hiding space, and tank-size needs.';
      case 'shrimps':
        return 'Best planned in groups of 6 or more. Sensitive invertebrates that need mature, stable aquariums and peaceful tankmates.';
      case 'guppies':
        return 'Best planned in pairs. Active livebearers that prefer stable water, gentle flow, and non-aggressive companions.';
      case 'tanganyikan':
        return 'Best planned in pairs. African cichlids that need careful compatibility planning, hard water, and suitable territories.';
      case 'rasboras':
        return 'Best planned in groups of 6 or more. Peaceful schooling fish that suit planted community aquariums with stable water.';
      case 'algae-eaters':
        return 'Best planned after confirming tank size, flow, and algae availability. Helpful grazers that still need prepared foods and clean water.';
      case 'chichilds':
        return 'Best planned in pairs. Dwarf cichlids need territories, hiding spots, and careful tankmate selection.';
      default:
        return 'Ask us before ordering so we can confirm fit with your aquarium setup.';
    }
  }

  fishProfileDetails(item: DisplayFish): FishProfileParameter[] {
    return item.profile ?? [];
  }

  plantProfileSummary(item: DisplayPlant): string {
    switch (item.categoryId) {
      case 'stem-plants':
        return 'Stem plant bunches are best planted in groups with regular trimming, good light, and steady nutrients for compact growth.';
      case 'rosette-plants':
        return 'Rosette plants are rooted plants that prefer stable substrate placement and should not have the crown buried too deep.';
      case 'carpet-plants':
        return 'Carpeting plants do best with strong light, nutrient-rich substrate, and consistent trimming once they start spreading.';
      case 'epiphyte-plants':
        return 'Epiphyte plants are best attached to wood or rock, with the rhizome kept above the substrate.';
      case 'mosses':
        return 'Mosses and liverworts attach well to hardscape and prefer clean water, gentle flow, and regular trimming.';
      case 'floating-plants':
        return 'Floating plants grow at the surface and help shade aquariums, but need open surface space and periodic thinning.';
      default:
        return 'Aquatic plants need stable water, suitable light, and steady nutrients after planting.';
    }
  }

  plantProfileDetails(item: DisplayPlant): FishProfileParameter[] {
    return item.profile ?? [];
  }

  fishImages(item: DisplayFish): string[] {
    return item.images?.length ? item.images : [item.image];
  }

  fishVideos(item: DisplayFish): string[] {
    return item.videos ?? [];
  }

  fishProfileMedia(item: DisplayFish): ProfileMedia[] {
    return [
      ...this.fishVideos(item).map((src) => ({ type: 'video' as const, src })),
      ...this.fishImages(item).map((src) => ({ type: 'image' as const, src })),
    ];
  }

  selectedProfileMedia(item: DisplayFish): ProfileMedia {
    const media = this.fishProfileMedia(item);
    return media[this.selectedProfileMediaIndex()] ?? media[0];
  }

  selectedCatalogMedia(item: DisplayFish): ProfileMedia {
    const media = this.fishProfileMedia(item);
    const index = this.selectedCatalogMediaIndices()[item.id] ?? 0;
    return media[index] ?? media[0];
  }

  selectedCatalogMediaIndex(item: DisplayFish): number {
    return this.selectedCatalogMediaIndices()[item.id] ?? 0;
  }

  selectProfileMedia(index: number): void {
    this.selectedProfileMediaIndex.set(index);
  }

  selectCatalogMedia(item: DisplayFish, index: number): void {
    this.selectedCatalogMediaIndices.update((indices) => ({
      ...indices,
      [item.id]: index,
    }));
    this.showMediaNavigator(`catalog-${item.id}`);
  }

  changeProfileMedia(item: DisplayFish, amount: number): void {
    const mediaLength = this.fishProfileMedia(item).length;
    if (!mediaLength) {
      return;
    }

    const nextIndex = (this.selectedProfileMediaIndex() + amount + mediaLength) % mediaLength;
    this.selectedProfileMediaIndex.set(nextIndex);
    this.showMediaNavigator('profile');
  }

  changeCatalogMedia(item: DisplayFish, amount: number): void {
    const mediaLength = this.fishProfileMedia(item).length;
    if (!mediaLength) {
      return;
    }

    const currentIndex = this.selectedCatalogMediaIndex(item);
    this.selectCatalogMedia(item, (currentIndex + amount + mediaLength) % mediaLength);
  }

  showMediaNavigator(key: string): void {
    clearTimeout(this.mediaNavigatorTimers.get(key));
    this.visibleMediaNavigators.update((state) => ({
      ...state,
      [key]: true,
    }));
    this.mediaNavigatorTimers.set(
      key,
      setTimeout(() => {
        this.visibleMediaNavigators.update((state) => ({
          ...state,
          [key]: false,
        }));
        this.mediaNavigatorTimers.delete(key);
      }, 1000),
    );
  }

  mediaNavigatorVisible(key: string): boolean {
    return this.visibleMediaNavigators()[key] ?? false;
  }

  primaryFishImage(item: DisplayFish): string {
    return this.fishImages(item)[0] ?? item.image;
  }

  plantImages(item: DisplayPlant): string[] {
    return item.images?.length ? item.images : [item.image];
  }

  primaryPlantImage(item: DisplayPlant): string {
    return this.plantImages(item)[0] ?? item.image;
  }

  activateImageZoom(event: PointerEvent): void {
    const frame = event.currentTarget as HTMLElement;
    frame.classList.add('zoom-active');
    this.updateImageZoom(event);
  }

  updateImageZoom(event: PointerEvent): void {
    const frame = event.currentTarget as HTMLElement;
    const bounds = frame.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;

    frame.style.setProperty('--zoom-x', `${Math.max(0, Math.min(100, x))}%`);
    frame.style.setProperty('--zoom-y', `${Math.max(0, Math.min(100, y))}%`);
  }

  resetImageZoom(event: PointerEvent): void {
    const frame = event.currentTarget as HTMLElement;
    frame.classList.remove('zoom-active');
    frame.style.removeProperty('--zoom-x');
    frame.style.removeProperty('--zoom-y');
  }

  checkoutWhatsApp(): void {
    const customerNumber = this.customerWhatsapp().trim();

    if (!customerNumber) {
      window.alert('Please enter your WhatsApp number before checkout.');
      return;
    }

    if (!this.doaPolicyAccepted()) {
      window.alert('Please read and accept the DOA & Refund Policy before checkout.');
      return;
    }

    const orderLines = this.cart()
      .map(
        (line) =>
          `${line.quantity} x ${line.name} (${this.cartLineUnitLabel(line)}) - ₹${line.quantity * line.unitPrice}`,
      )
      .join('\n');
    
    const addressLine = this.customerAddress().trim() ? `\n\nDelivery Address:\n${this.customerAddress()}` : '';
    
    const message = [
      'Hello Rags Aqua World, I want to place this order:',
      orderLines,
      `Total (excluding shipping): ₹${this.cartTotal()}`,
      `Customer WhatsApp: ${customerNumber}${addressLine}`,
    ].join('\n\n');
    const url = `https://wa.me/${this.businessWhatsapp}?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank', 'noopener');
  }
}
