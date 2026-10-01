import { Component, Input } from '@angular/core';
import { faCodeFork, faEye, faStar, IconDefinition } from '@fortawesome/free-solid-svg-icons';

// Mirrors the mapping in home.component.ts's CATEGORY_BADGE_LABELS: short labels
// for the "also in" list, keyed by tab name.
const CATEGORY_BADGE_LABELS: Record<string, string> = {
  Modules: 'Module',
  Tools: 'Tool',
  'Lua/Eluna/ALE Scripts': 'Lua Script',
  SQL: 'SQL',
  DBC: 'DBC',
};

@Component({
    selector: 'app-repo',
    templateUrl: './repo.component.html',
    styleUrls: ['./repo.component.scss'],
    standalone: false
})
export class RepoComponent {
  @Input() id: number;
  @Input() name: string;
  @Input() stars: number;
  @Input() watchers: number;
  @Input() forks: number;
  @Input() created: Date | string;
  @Input() updated: Date | string;
  @Input() added: Date | string;
  @Input() description: string;
  @Input() fullName: string;
  @Input() htmlUrl: string;
  @Input() authorLogin: string;
  @Input() authorUrl: string;
  /** Only set when this card is shown in an aggregate tab (e.g. "All"). */
  @Input() category: string;
  /** Every AC topic this repo matched, in the same case. Only set in an aggregate tab. */
  @Input() categories: string[];

  showExtraCategories = false;

  readonly faStar: IconDefinition = faStar;
  readonly faEye: IconDefinition = faEye;
  readonly faCodeFork: IconDefinition = faCodeFork;

  /** Categories beyond the primary one already shown as the main badge. */
  get extraCategories(): string[] {
    if (!this.categories || this.categories.length <= 1) {
      return [];
    }
    return this.categories.slice(1).map((c) => CATEGORY_BADGE_LABELS[c] ?? c);
  }

  toggleExtraCategories(): void {
    this.showExtraCategories = !this.showExtraCategories;
  }
}
