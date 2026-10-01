import { Location } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { MatTabChangeEvent } from '@angular/material/tabs';
import { faSearch, IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { Repository } from 'src/@types';
import { CatalogueService } from '../services/catalogue/catalogue.service';

const PAGE_STORAGE_KEY = 'azerothcore.catalogue.page';
const RETURN_HASH_STORAGE_KEY = 'azerothcore.catalogue.returnHash';
const SORT_STORAGE_KEY = 'azerothcore.catalogue.sort';
const COLUMNS_STORAGE_KEY = 'azerothcore.catalogue.columns';
const PAGE_SIZE_STORAGE_KEY = 'azerothcore.catalogue.pageSize';
const SEARCH_STORAGE_KEY = 'azerothcore.catalogue.search';

export type SortKey = 'stars' | 'updated' | 'created';
export type ColumnsKey = 1 | 2 | 3;
export type PageSizeKey = 12 | 24 | 48 | 96 | 'all';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'stars', label: 'Most stars' },
  { key: 'updated', label: 'Recently updated' },
  { key: 'created', label: 'Recently added' },
];

export const COLUMN_OPTIONS: { key: ColumnsKey; label: string }[] = [
  { key: 1, label: '1' },
  { key: 2, label: '2' },
  { key: 3, label: '3' },
];

export const PAGE_SIZE_OPTIONS: { key: PageSizeKey; label: string }[] = [
  { key: 12, label: '12' },
  { key: 24, label: '24' },
  { key: 48, label: '48' },
  { key: 96, label: '96' },
  { key: 'all', label: 'All' },
];

const DEFAULT_COLUMNS: ColumnsKey = 1;
const DEFAULT_PAGE_SIZE: PageSizeKey = 12;

// Short labels shown on the category badge in the aggregate "All" tab, keyed by tab name.
const CATEGORY_BADGE_LABELS: Record<string, string> = {
  Modules: 'Module',
  Tools: 'Tool',
  'Lua/Eluna/ALE Scripts': 'Lua Script',
  SQL: 'SQL',
  DBC: 'DBC',
};

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    standalone: false
})
export class HomeComponent {
  constructor(public catalogueService: CatalogueService, public cdRef: ChangeDetectorRef, private location: Location) {
    window.parent.document.title = 'GitCatalogue';
    this.saveRoute();
  }

  page = this.readPage();
  sort: SortKey = this.readSort();
  columns: ColumnsKey = this.readColumns();
  pageSize: PageSizeKey = this.readPageSize();
  search: string = this.readSearch();
  readonly faSearch: IconDefinition = faSearch;
  readonly sortOptions = SORT_OPTIONS;
  readonly columnOptions = COLUMN_OPTIONS;
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  get columnClass(): string {
    return `catalogue-col-${this.columns}`;
  }

  isEvenRow(index: number): boolean {
    return Math.floor(index / this.columns) % 2 === 0;
  }

  // Tracks the tab the user actually clicked. catalogueService.tabIndex reads a
  // route-param snapshot that onTabChange() never re-triggers (it calls
  // Location.go() directly instead of a router navigation), so it stays frozen
  // on whatever tab was active on page load. This mirrors the real selection.
  activeIndex: number = this.catalogueService.tabIndex;

  get activeTabKey(): string {
    const keys = this.catalogueService.confTabsKeys;
    return keys[this.activeIndex] ?? keys[0];
  }

  categoryBadgeLabel(category: string): string {
    return CATEGORY_BADGE_LABELS[category] ?? category;
  }

  readPage(): number {
    try {
      const page = parseInt(sessionStorage.getItem(PAGE_STORAGE_KEY) || '0', 10);
      return isNaN(page) || page < 0 ? 0 : page;
    } catch (error) {
      return 0;
    }
  }

  savePage(): void {
    try {
      sessionStorage.setItem(PAGE_STORAGE_KEY, String(this.page));
    } catch (error) {}
  }

  readSort(): SortKey {
    try {
      const sort = sessionStorage.getItem(SORT_STORAGE_KEY) as SortKey;
      return SORT_OPTIONS.some((option) => option.key === sort) ? sort : 'stars';
    } catch (error) {
      return 'stars';
    }
  }

  saveSort(): void {
    try {
      sessionStorage.setItem(SORT_STORAGE_KEY, this.sort);
    } catch (error) {}
  }

  readColumns(): ColumnsKey {
    try {
      const columns = parseInt(sessionStorage.getItem(COLUMNS_STORAGE_KEY) || '', 10);
      return COLUMN_OPTIONS.some((option) => option.key === columns) ? (columns as ColumnsKey) : DEFAULT_COLUMNS;
    } catch (error) {
      return DEFAULT_COLUMNS;
    }
  }

  saveColumns(): void {
    try {
      sessionStorage.setItem(COLUMNS_STORAGE_KEY, String(this.columns));
    } catch (error) {}
  }

  readPageSize(): PageSizeKey {
    try {
      const stored = sessionStorage.getItem(PAGE_SIZE_STORAGE_KEY);
      const pageSize = stored === 'all' ? 'all' : parseInt(stored || '', 10);
      return PAGE_SIZE_OPTIONS.some((option) => option.key === pageSize) ? (pageSize as PageSizeKey) : DEFAULT_PAGE_SIZE;
    } catch (error) {
      return DEFAULT_PAGE_SIZE;
    }
  }

  savePageSize(): void {
    try {
      sessionStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(this.pageSize));
    } catch (error) {}
  }

  saveRoute(path?: string): void {
    try {
      const route = path || this.location.path() || '/home';
      sessionStorage.setItem(RETURN_HASH_STORAGE_KEY, `#${route}`);
    } catch (error) {}
  }

  resetPage(): void {
    this.page = 0;
    this.savePage();
    this.saveRoute();
    this.refresh();
  }

  refresh(): void {
    this.cdRef.detectChanges();
  }

  readSearch(): string {
    try {
      return sessionStorage.getItem(SEARCH_STORAGE_KEY) || '';
    } catch (error) {
      return '';
    }
  }

  saveSearch(): void {
    try {
      sessionStorage.setItem(SEARCH_STORAGE_KEY, this.search || '');
    } catch (error) {}
  }

  onSearchChange(value: string): void {
    this.saveSearch();
    this.resetPage();
  }

  onSortChange(value: SortKey): void {
    this.saveSort();
    this.resetPage();
  }

  onColumnsChange(value: ColumnsKey): void {
    this.saveColumns();
    this.refresh();
  }

  onPageSizeChange(value: PageSizeKey): void {
    this.savePageSize();
    this.resetPage();
  }

  onPageChange(page: PageEvent): void {
    this.page = page.pageIndex;
    this.savePage();
    this.saveRoute();
  }

  onTabChange(tab: MatTabChangeEvent): void {
    const index = tab.index;
    const tabName = Object.keys(this.catalogueService.CONF.tabs)[index];
    const path = `/tab${this.catalogueService.CONF.tabs[tabName].path}`;

    this.activeIndex = index;
    this.page = 0;
    this.savePage();
    this.saveRoute(path);

    if (this.location.path() !== path) {
      this.location.go(path);
    }
  }

  get effectivePageSize(): number {
    return this.pageSize === 'all' ? Number.MAX_SAFE_INTEGER : this.pageSize;
  }

  currentPageItems(modules: Repository[]): Repository[] {
    const items = this.sortItems(this.matchingItems(modules));
    if (this.pageSize === 'all') {
      return items;
    }
    return items.slice(this.effectivePageSize * this.page, this.effectivePageSize * (this.page + 1));
  }

  filteredLength(modules: Repository[]): number {
    return this.matchingItems(modules).length;
  }

  private matchingItems(modules: Repository[]): Repository[] {
    if (!this.search) {
      return modules;
    }
    const search = this.search.toLowerCase();
    return modules.filter((item) => item.name.toLowerCase().indexOf(search) > -1);
  }

  private sortItems(modules: Repository[]): Repository[] {
    if (this.sort === 'stars') {
      return [...modules].sort((a, b) => b.stargazers_count - a.stargazers_count);
    }

    // pushed_at tracks the last commit, unlike updated_at which also moves on metadata changes
    const dateOf = (item: Repository) => (this.sort === 'updated' ? item.pushed_at : item.created_at);
    return [...modules].sort((a, b) => this.time(dateOf(b)) - this.time(dateOf(a)));
  }

  private time(date: Date | string): number {
    const time = date ? new Date(date).getTime() : 0;
    return isNaN(time) ? 0 : time;
  }
}
