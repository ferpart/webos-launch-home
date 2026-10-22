import {getAppIdCandidates} from './app-icons.js';

/**
 * Wide 16:9 tile art for the Dock home style (dock-style.js), like the tiles
 * on an Apple TV. Made from each app's own launch art as installed on webOS
 * (its splash screen, or its logo on its brand colour), 720x404: twice the
 * tile. Apps without one get their icon on a blurred bleed of itself.
 */
const BANNERS = {
  'netflix': 'netflix.jpg',
  'amazon': 'prime-video.jpg',
  'youtube.leanback.v4': 'youtube.jpg',
  'com.crunchyroll.webapp': 'crunchyroll.jpg',
  'com.disney.disneyplus-prod': 'disney-plus.jpg',
  'com.wbd.stream': 'max.jpg',
  'com.hbo.hbomax': 'max.jpg',
  'com.disney.alch.prod.lrd.app': 'star-plus.jpg',
  'org.webosbrew.hbchannel': 'homebrew.jpg'
};

/** The banner's packaged path for app `id` (any of its ids), or ''. */
export function appBannerFor(id) {
  const ids = getAppIdCandidates(id || '');
  for (let i = 0; i < ids.length; i += 1) {
    if (BANNERS[ids[i]]) return 'assets/app-banners/' + BANNERS[ids[i]];
  }
  return '';
}
