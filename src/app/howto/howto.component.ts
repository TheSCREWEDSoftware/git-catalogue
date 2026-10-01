import { Component } from '@angular/core';
import { CatalogueService } from '../services/catalogue/catalogue.service';
import { faCaretLeft, IconDefinition } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-howto',
    templateUrl: './howto.component.html',
    standalone: false
})
export class HowtoComponent {
  constructor(public catalogueService: CatalogueService) {}

  readonly faCaretLeft: IconDefinition = faCaretLeft;

  // Topics a repo can carry in addition to its required category topic, e.g.
  // to flag which expansion or infra area it targets. Not part of CONF.tabs:
  // these aren't browsable categories, just documented here for reference.
  readonly optionalTopics: string[] = [
    'azerothcore-updater', 'azerothcore-website', 'azerothcore-docker',
    'azerothcore-modding', 'azerothcore-retroport', 'azerothcore-vanilla',
    'azerothcore-tbc', 'azerothcore-wotlk', 'azerothcore-cata', 'azerothcore-mop',
    'azerothcore-wod', 'azerothcore-legion', 'azerothcore-bfa', 'azerothcore-sl',
    'azerothcore-df', 'azerothcore-tww', 'azerothcore-mn', 'azerothcore-tlt',
  ];

  get requiredTopicTabKeys(): string[] {
    if (!this.catalogueService.CONF) {
      return [];
    }
    return Object.keys(this.catalogueService.CONF.tabs).filter(
      (key) => !!this.catalogueService.CONF.tabs[key].topic
    );
  }

  get firstRequiredTopicTabKey(): string | undefined {
    return this.requiredTopicTabKeys[0];
  }
}
