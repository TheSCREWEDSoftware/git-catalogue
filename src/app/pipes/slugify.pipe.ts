import { Pipe, PipeTransform } from '@angular/core';

/**
 * Turns a repo name into a URL-friendly slug for the readable
 * /details/:id/:name route, e.g. 'mod-playerbots' -> 'mod-playerbots',
 * 'WoW Database Editor' -> 'wow-database-editor'.
 * Purely cosmetic: the resolver only ever reads the numeric :id segment,
 * so this never needs to round-trip back into real data.
 */
@Pipe({
    name: 'slugify',
    standalone: false
})
export class SlugifyPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) {
      return '';
    }
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
