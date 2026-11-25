/** Display the registry's current brand without changing legacy profile URLs. */
export function displayAuthorHandle(handle: string): string {
  return handle === 'agentforge' ? 'agentlemon' : handle
}

export function displayAuthorName(author: {
  uid: string
  name: string
}): string {
  return author.uid === 'agentforge' ? 'AgentLemon' : author.name
}
