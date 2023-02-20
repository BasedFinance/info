import { ApolloClient } from 'apollo-client'
import { InMemoryCache } from 'apollo-cache-inmemory'
import { HttpLink } from 'apollo-link-http'

export const testClient = new ApolloClient({
  link: new HttpLink({
    uri: 'https://based-graph.herokuapp.com/graphql',
  }),
  cache: new InMemoryCache(),
})

