import { networkActivity } from '../gateway/networkActivity';

/** Outside the scaled stage: survives screen refreshes and remains visible over the tutorial. */
export function mountNetworkIndicator(): () => void {
  const indicator = document.createElement('div');
  indicator.className = 'network-wait';
  indicator.hidden = true;
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.setAttribute('aria-atomic', 'true');
  indicator.innerHTML = '<span class="network-wait-spinner" aria-hidden="true"></span><span>等待网络中...</span>';
  document.body.append(indicator);
  const unsubscribe = networkActivity.subscribe(waiting => { indicator.hidden = !waiting; });
  return () => { unsubscribe(); indicator.remove(); };
}
