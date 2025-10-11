
IRCv3

    Home Working Group FAQs Specifications Registry Support Tables 

extended-monitor Extension

Copyright © 2021 Simon Ser <contact@emersion.fr>

Unlimited redistribution and modification of this document is allowed provided that the above copyright notice and this permission notice remains intact.

Extends: Monitor, away-notify, account-notify, chghost, setname
Description

With the help of extensions such as away-notify, account-notify, chghost and setname, clients are able to keep other users’ metadata up-to-date with their local state when they share a channel. However, clients are not able to do so when they don’t share a channel.

The monitor extension allows clients to track when another user goes offline or comes online. This specification extends MONITOR to also include AWAY, ACCOUNT, CHGHOST and SETNAME notifications.

The extended-monitor capability advertises that the server supports sending such extended notifications for monitored nicks. When enabled by the client:

    If away-notify is also enabled, the client will get AWAY notifications for monitored nicks.
    If account-notify is also enabled, the client will get ACCOUNT notifications for monitored nicks.
    If chghost is also enabled, the client will get CHGHOST notifications for monitored nicks.
    If setname is also enabled, the client will get SETNAME notifications for monitored nicks.

Privacy considerations

This extension allows users to monitor personal information of other users. Since the IRC protocol doesn’t provide any way to atomically change this personal information (nick, host, realname all at the same time), it may be possible for an outside observer to track nick changes:

    Observer monitors nick A and nick B.
    User with nick A changes their nick to nick B, then changes their host and realname.
    Observer receives RPL_MONOFFLINE for nick A, RPL_MONONLINE for nick B, and then receives notifications for host and realname changes.

In this scenario, it’s possible for the observer to figure out that nick A and nick B are owned by the same user by comparing the host and realname.

For this reason, privacy conscious clients are advised to disconnect and re-connect to the IRC server as a way to atomically update personal information.

Software supporting extended-monitor: Ergo, InspIRCd, UnrealIRCd, glirc, Halloy, HexChat, mIRC, senpai, gamja, IRCCloud, Goguma, soju (as Server), soju (as Client), Eggdrop, Kitteh IRC Client Library
IRCv3 Working Group © 2025 · RSS

    Home Working Group FAQs Specifications 

